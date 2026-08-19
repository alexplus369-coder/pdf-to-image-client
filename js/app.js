(() => {
    // Elementos DOM
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    const optionsSection = document.getElementById('optionsSection');
    const progressSection = document.getElementById('progressSection');
    const resultsSection = document.getElementById('resultsSection');
    const fileName = document.getElementById('fileName');
    const filePages = document.getElementById('filePages');
    const removeFile = document.getElementById('removeFile');
    const formatSelector = document.getElementById('formatSelector');
    const qualityRange = document.getElementById('qualityRange');
    const qualityValue = document.getElementById('qualityValue');
    const scaleSelect = document.getElementById('scaleSelect');
    const convertBtn = document.getElementById('convertBtn');
    const progressTitle = document.getElementById('progressTitle');
    const progressPercent = document.getElementById('progressPercent');
    const progressFill = document.getElementById('progressFill');
    const cancelBtn = document.getElementById('cancelBtn');
    const pagesList = document.getElementById('pagesList');
    const resultsMeta = document.getElementById('resultsMeta');
    const downloadZipBtn = document.getElementById('downloadZipBtn');
    const toast = document.getElementById('toast');

    // Estado
    let currentFile = null;
    let pdfDocument = null;
    let isConverting = false;
    let shouldCancel = false;
    let convertedPages = []; // {blob, url, pageNum}

    // ===== Event Listeners =====

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') handleFile(f);
        else showToast('Solo se permiten archivos PDF', 'error');
    });

    // Cambiar formato
    formatSelector.querySelectorAll('.segment').forEach(btn => {
        btn.addEventListener('click', () => {
            formatSelector.querySelectorAll('.segment').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const isJpeg = btn.dataset.value === 'jpeg';
            qualityRange.disabled = !isJpeg;
            if (!isJpeg) qualityValue.textContent = '100%';
            else qualityValue.textContent = qualityRange.value + '%';
        });
    });

    // Calidad
    qualityRange.addEventListener('input', (e) => {
        qualityValue.textContent = e.target.value + '%';
    });

    // Eliminar archivo
    removeFile.addEventListener('click', resetAll);

    // Convertir
    convertBtn.addEventListener('click', startConversion);

    // Cancelar
    cancelBtn.addEventListener('click', () => {
        shouldCancel = true;
        showToast('Cancelando...');
    });

    // Descargar ZIP
    downloadZipBtn.addEventListener('click', downloadZip);

    // ===== Funciones =====

    async function handleFile(file) {
        if (file.type !== 'application/pdf') {
            showToast('El archivo no es un PDF válido', 'error');
            return;
        }
        currentFile = file;
        fileName.textContent = file.name;

        try {
            const arrayBuffer = await file.arrayBuffer();
            pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            filePages.textContent = `${pdfDocument.numPages} página${pdfDocument.numPages !== 1 ? 's' : ''}`;

            if (pdfDocument.numPages > 100) {
                showToast('PDF muy grande. La conversión puede tardar.', 'warning');
            }

            uploadSection.style.display = 'none';
            optionsSection.style.display = 'block';
            resultsSection.style.display = 'none';
            progressSection.style.display = 'none';
        } catch (err) {
            console.error(err);
            showToast('No se pudo leer el PDF', 'error');
        }
    }

    async function startConversion() {
        if (!pdfDocument || isConverting) return;

        const format = formatSelector.querySelector('.segment.active').dataset.value;
        const quality = parseInt(qualityRange.value) / 100;
        const scale = parseFloat(scaleSelect.value);
        const total = pdfDocument.numPages;

        isConverting = true;
        shouldCancel = false;
        convertedPages = [];

        // UI
        optionsSection.style.display = 'none';
        progressSection.style.display = 'block';
        resultsSection.style.display = 'none';
        setProgress(0, `Preparando ${total} páginas...`);

        const btnLabel = convertBtn.querySelector('.btn-label');
        const btnSpinner = convertBtn.querySelector('.btn-spinner');
        btnLabel.style.display = 'none';
        btnSpinner.style.display = 'inline-flex';
        convertBtn.disabled = true;

        const zip = new JSZip();
        const folder = zip.folder("imagenes");

        try {
            for (let i = 1; i <= total; i++) {
                if (shouldCancel) throw new Error('Cancelado por el usuario');

                setProgress(((i - 1) / total) * 100, `Convirtiendo página ${i} de ${total}...`);

                const page = await pdfDocument.getPage(i);
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                // Fondo blanco para JPEG (evita fondo negro)
                if (format === 'jpeg') {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                await page.render({ canvasContext: ctx, viewport }).promise;

                const blob = await new Promise((resolve) => {
                    canvas.toBlob(resolve, `image/${format}`, format === 'jpeg' ? quality : undefined);
                });

                const url = URL.createObjectURL(blob);
                convertedPages.push({ blob, url, pageNum: i, format });

                // Añadir al ZIP
                const ext = format === 'jpeg' ? 'jpg' : 'png';
                folder.file(`pagina-${String(i).padStart(3, '0')}.${ext}`, blob);

                page.cleanup();
                // Liberar memoria del canvas
                canvas.width = 0;
                canvas.height = 0;
            }

            if (shouldCancel) throw new Error('Cancelado');

            setProgress(100, 'Completado');
            showResults(zip);

        } catch (err) {
            if (err.message === 'Cancelado por el usuario' || shouldCancel) {
                showToast('Conversión cancelada', 'error');
            } else {
                showToast('Error: ' + err.message, 'error');
            }
            optionsSection.style.display = 'block';
            progressSection.style.display = 'none';
        } finally {
            isConverting = false;
            btnLabel.style.display = 'inline';
            btnSpinner.style.display = 'none';
            convertBtn.disabled = false;
        }
    }

    function setProgress(percent, title) {
        progressFill.style.width = percent + '%';
        progressPercent.textContent = Math.round(percent) + '%';
        if (title) progressTitle.textContent = title;
    }

    function showResults(zip) {
        progressSection.style.display = 'none';
        resultsSection.style.display = 'block';

        resultsMeta.textContent = `${convertedPages.length} página${convertedPages.length !== 1 ? 's' : ''} convertida${convertedPages.length !== 1 ? 's' : ''}`;

        pagesList.innerHTML = '';
        convertedPages.forEach((page, idx) => {
            const card = document.createElement('div');
            card.className = 'page-card';
            card.innerHTML = `
                <img src="${page.url}" alt="Página ${page.pageNum}" class="page-thumb" loading="lazy">
                <div class="page-footer">
                    <span class="page-num">Página ${page.pageNum}</span>
                    <button class="page-dl" data-idx="${idx}">Descargar</button>
                </div>
            `;
            pagesList.appendChild(card);
        });

        // Guardar referencia al zip para descarga
        pagesList.dataset.zip = JSON.stringify(true); // marcador
        pagesList._zip = zip;

        document.querySelectorAll('.page-dl').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = convertedPages[parseInt(btn.dataset.idx)];
                const ext = p.format === 'jpeg' ? 'jpg' : 'png';
                saveAs(p.blob, `pagina-${String(p.pageNum).padStart(3, '0')}.${ext}`);
            });
        });
    }

    async function downloadZip() {
        const zip = pagesList._zip;
        if (!zip) return;

        downloadZipBtn.disabled = true;
        downloadZipBtn.innerHTML = `<svg class="spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="60" stroke-dashoffset="20"/></svg> Generando...`;

        try {
            const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
            saveAs(content, 'pdf-imagenes.zip');
            showToast('ZIP descargado', 'success');
        } catch (e) {
            showToast('Error al generar ZIP', 'error');
        } finally {
            downloadZipBtn.disabled = false;
            downloadZipBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Descargar ZIP`;
        }
    }

    function resetAll() {
        currentFile = null;
        pdfDocument = null;
        isConverting = false;
        shouldCancel = false;
        convertedPages.forEach(p => URL.revokeObjectURL(p.url));
        convertedPages = [];
        fileInput.value = '';
        uploadSection.style.display = 'block';
        optionsSection.style.display = 'none';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        setProgress(0, '');
    }

    function showToast(msg, type = '') {
        toast.textContent = msg;
        toast.className = 'toast' + (type ? ' ' + type : '');
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => toast.classList.remove('show'), 3200);
    }
})();