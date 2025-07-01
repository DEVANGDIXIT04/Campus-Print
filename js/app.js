// Set PDF.js worker path
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
}

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const submitBtn = document.getElementById('submitBtn');
const modal = document.getElementById('fileSettingsModal');
const filePreview = document.getElementById('filePreview');
const previewContent = document.getElementById('previewContent');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const currentPageEl = document.getElementById('currentPage');
const totalPreviewPagesEl = document.getElementById('totalPreviewPages');

// Preview state
let currentPreviewFile = null;
let currentPage = 1;
let totalPreviewPages = 1;

// State
let uploadedFiles = [];
let totalPages = 0;
let currentFileId = null;

// Event Listeners
uploadArea.addEventListener('click', () => fileInput.click());

// Drag and drop functionality
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
});

['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, unhighlight, false);
});

uploadArea.addEventListener('drop', handleDrop, false);
fileInput.addEventListener('change', handleFileSelect, false);

// Student info change listeners
document.getElementById('studentName').addEventListener('input', updateSubmitButton);
document.getElementById('studentId').addEventListener('input', updateSubmitButton);

// Submit button click handler
submitBtn.addEventListener('click', handleSubmit);

// Helper Functions
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    uploadArea.classList.add('drag-over');
}

function unhighlight() {
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
}

async function handleFiles(files) {
    if (!files.length) return;
    
    // Process each file sequentially
    for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
            alert(`File ${file.name} is too large. Maximum size is 10MB.`);
            continue;
        }

        // Create initial file object with estimated pages
        const fileObj = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            pages: 1, // Start with 1 page as default
            pageSettings: [],
            isProcessing: true
        };

        // Add to the list immediately with loading state
        uploadedFiles.push(fileObj);
        renderFileList();
        
        try {
            // Get actual page count for PDFs
            if (file.name.toLowerCase().endsWith('.pdf')) {
                const pageCount = await getPdfPageCount(file);
                fileObj.pages = pageCount;
            } else if (['.jpg', '.jpeg', '.png', '.gif'].some(ext => file.name.toLowerCase().endsWith(ext))) {
                fileObj.pages = 1; // Images are always 1 page
            } else {
                // For other files, use the estimate
                fileObj.pages = estimatePages(file);
            }
            
            // Initialize page settings with the correct count
            fileObj.pageSettings = [];
            for (let i = 1; i <= fileObj.pages; i++) {
                fileObj.pageSettings.push({
                    pageNumber: i,
                    colorMode: 'bw',
                    orientation: 'portrait'
                });
            }
            
        } catch (error) {
            console.error('Error processing file:', error);
            // Fallback to estimated pages if there's an error
            fileObj.pages = estimatePages(file);
            
            // Initialize with estimated pages
            fileObj.pageSettings = [];
            for (let i = 1; i <= fileObj.pages; i++) {
                fileObj.pageSettings.push({
                    pageNumber: i,
                    colorMode: 'bw',
                    orientation: 'portrait'
                });
            }
        } finally {
            fileObj.isProcessing = false;
            // Update the display
            renderFileList();
            updateSummary();
            updateSubmitButton();
        }
    }
}

async function getPdfPageCount(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        
        fileReader.onload = async function() {
            try {
                const typedArray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedArray).promise;
                resolve(pdf.numPages);
            } catch (error) {
                console.error('Error getting PDF page count:', error);
                resolve(estimatePages(file)); // Fallback to estimate
            }
        };
        
        fileReader.onerror = function() {
            console.error('Error reading file');
            resolve(estimatePages(file)); // Fallback to estimate
        };
        
        fileReader.readAsArrayBuffer(file);
    });
}

function estimatePages(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (['jpg', 'jpeg', 'png'].includes(extension)) {
        return 1;
    } else if (extension === 'pdf') {
        return Math.max(1, Math.ceil(file.size / (50 * 1024)));
    } else if (['doc', 'docx'].includes(extension)) {
        return Math.max(1, Math.ceil(file.size / (20 * 1024)));
    }
    return 1;
}

function renderFileList() {
    fileList.innerHTML = '';
    
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '<div class="no-files">No files uploaded yet</div>';
        return;
    }
    
    uploadedFiles.forEach(fileObj => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-item';
        fileDiv.dataset.id = fileObj.id;
        
        const totalPages = fileObj.pageSettings.length;
        const bwPages = fileObj.pageSettings.filter(p => p.colorMode === 'bw').length;
        const colorPages = totalPages - bwPages;
        const fileCost = (bwPages * 2) + (colorPages * 10);
        
        fileDiv.innerHTML = `
            <div class="file-info">
                <div class="file-name">${fileObj.name}</div>
                <div class="file-details">
                    ${formatFileSize(fileObj.size)} • 
                    ${fileObj.isProcessing ? '...' : totalPages} page${totalPages !== 1 ? 's' : ''} • 
                    ${bwPages} B&W + ${colorPages} Color • 
                    ₹${fileCost}
                    ${fileObj.isProcessing ? '<span class="processing-indicator">Processing...</span>' : ''}
                </div>
            </div>
            <div class="file-actions">
                <button class="preview-btn" data-file-id="${fileObj.id}" title="Preview">👁️</button>
                <button class="settings-btn" data-file-id="${fileObj.id}" title="Settings">⚙️</button>
                <button class="remove-btn" data-file-id="${fileObj.id}" title="Remove">✕</button>
            </div>
        `;
        
        fileList.appendChild(fileDiv);
    });
    
    // Add event listeners to the new buttons
    document.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileId = e.target.closest('button').dataset.fileId;
            const file = uploadedFiles.find(f => f.id === fileId);
            if (file) {
                showFilePreview(file.file);
                // Show the modal with just the preview
                document.getElementById('modalFileName').textContent = `Preview: ${file.name}`;
                modal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    });
    
    document.querySelectorAll('.settings-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileId = e.target.closest('button').dataset.fileId;
            openFileSettings(fileId);
        });
    });
    
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const fileId = e.target.closest('button').dataset.fileId;
            removeFile(fileId);
        });
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile(fileId) {
    uploadedFiles = uploadedFiles.filter(file => file.id !== fileId);
    renderFileList();
    updateSummary();
    updateSubmitButton();
}

function updateSummary() {
    let totalBWPages = 0;
    let totalColorPages = 0;
    
    uploadedFiles.forEach(file => {
        file.pageSettings.forEach(page => {
            if (page.colorMode === 'color') {
                totalColorPages++;
            } else {
                totalBWPages++;
            }
        });
    });
    
    totalPages = totalBWPages + totalColorPages;
    const totalCost = (totalBWPages * 2) + (totalColorPages * 10);
    
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('printCost').textContent = `₹${totalCost} (${totalBWPages} B&W + ${totalColorPages} Color)`;
    document.getElementById('totalAmount').textContent = `₹${totalCost}`;
}

function updateSubmitButton() {
    const studentName = document.getElementById('studentName').value.trim();
    const studentId = document.getElementById('studentId').value.trim();
    submitBtn.disabled = !(uploadedFiles.length > 0 && studentName && studentId);
}

// Modal Functions
// Preview functions
async function showFilePreview(file) {
    previewContent.innerHTML = '<div class="loading-text">Loading preview...</div>';
    filePreview.style.display = 'block';
    currentPreviewFile = file;
    
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (extension === 'pdf') {
        await renderPdfPreview(file);
    } else if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
        renderImagePreview(file);
    } else if (extension === 'txt') {
        renderTextPreview(file);
    } else if (['doc', 'docx'].includes(extension)) {
        previewContent.innerHTML = `
            <div class="document-preview">
                <div class="document-icon">📄</div>
                <h3>${file.name}</h3>
                <p>Preview not available for Word documents. The file will be printed as submitted.</p>
                <div class="document-info">
                    <div>Type: Microsoft Word Document</div>
                    <div>Size: ${formatFileSize(file.size)}</div>
                </div>
            </div>`;
        filePreview.style.display = 'block';
    } else {
        previewContent.innerHTML = `
            <div class="document-preview">
                <div class="document-icon">📄</div>
                <h3>${file.name}</h3>
                <p>Preview not available for this file type. The file will be printed as submitted.</p>
                <div class="document-info">
                    <div>Type: ${extension.toUpperCase()} File</div>
                    <div>Size: ${formatFileSize(file.size)}</div>
                </div>
            </div>`;
        filePreview.style.display = 'block';
    }
}

async function renderPdfPreview(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
        const pdf = await loadingTask.promise;
        
        totalPreviewPages = pdf.numPages;
        
        if (totalPreviewPages === 0) {
            throw new Error('No pages found in PDF');
        }
        
        // Clear previous content
        previewContent.innerHTML = '<div class="pdf-container"></div>';
        const pdfContainer = previewContent.querySelector('.pdf-container');
        
        // Update the file's page settings if needed
        const fileObj = uploadedFiles.find(f => f.file === file);
        if (fileObj) {
            // If the actual page count is different from our estimate, update it
            if (fileObj.pageSettings.length !== totalPreviewPages) {
                const newPageSettings = [];
                for (let i = 1; i <= totalPreviewPages; i++) {
                    // If we have existing settings for this page, use them, otherwise create new ones
                    const existingPage = fileObj.pageSettings[i - 1] || {};
                    newPageSettings.push({
                        pageNumber: i,
                        colorMode: existingPage.colorMode || 'bw',
                        orientation: existingPage.orientation || 'portrait'
                    });
                }
                fileObj.pageSettings = newPageSettings;
                fileObj.pages = totalPreviewPages; // Update the page count
                
                // Update the file list to reflect the correct page count
                renderFileList();
                updateSummary();
            }
        }
        
        // Render all pages
        for (let i = 1; i <= totalPreviewPages; i++) {
            await renderPdfPage(pdf, i, pdfContainer);
        }
        
    } catch (error) {
        console.error('Error rendering PDF:', error);
        previewContent.innerHTML = `<div class="preview-error">Error loading PDF: ${error.message}</div>`;
    }
}

async function renderPdfPage(pdf, pageNum, container) {
    try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Adjust viewport to fit container width while maintaining aspect ratio
        const containerWidth = previewContent.clientWidth - 40; // Account for padding
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale });
        
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page';
        
        const pageHeader = document.createElement('div');
        pageHeader.className = 'page-header';
        pageHeader.textContent = `Page ${pageNum}`;
        pageDiv.appendChild(pageHeader);
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        
        pageDiv.appendChild(canvas);
        container.appendChild(pageDiv);
        
        await page.render({
            canvasContext: context,
            viewport: scaledViewport
        }).promise;
        
    } catch (error) {
        console.error('Error rendering PDF page:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'preview-error';
        errorDiv.textContent = `Error loading page ${pageNum}`;
        container.appendChild(errorDiv);
    }
}

function renderImagePreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.alt = 'Preview';
        previewContent.innerHTML = '';
        previewContent.appendChild(img);
    };
    reader.readAsDataURL(file);
    
    totalPreviewPages = 1;
    totalPreviewPagesEl.textContent = '1';
    updatePagination();
}

function renderTextPreview(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        let content = e.target.result;
        
        // Truncate very large text files to prevent performance issues
        const MAX_LENGTH = 50000; // ~50KB
        let truncated = false;
        
        if (content.length > MAX_LENGTH) {
            content = content.substring(0, MAX_LENGTH) + '\n\n[...content truncated for preview...]';
            truncated = true;
        }
        
        previewContent.innerHTML = `
            <div class="text-preview-container">
                <div class="text-preview-header">
                    <span>${file.name}</span>
                    ${truncated ? '<span class="truncated-warning">(Preview truncated)</span>' : ''}
                </div>
                <pre class="preview-text">${escapeHtml(content)}</pre>
            </div>`;
    };
    reader.onerror = function() {
        previewContent.innerHTML = `
            <div class="document-preview">
                <div class="document-icon">📄</div>
                <h3>${file.name}</h3>
                <p>Could not read the file content.</p>
            </div>`;
    };
    reader.readAsText(file);
}

function updatePagination() {
    currentPageEl.textContent = currentPage;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPreviewPages;
}

// No pagination needed anymore - removed pagination event listeners

function openFileSettings(fileId) {
    currentFileId = fileId;
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file) return;
    
    document.getElementById('modalFileName').textContent = `Settings for: ${file.name}`;
    
    // Show preview of the file
    showFilePreview(file.file);
    
    const container = document.getElementById('pageSettingsContainer');
    container.innerHTML = '';
    
    file.pageSettings.forEach((page, index) => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-row';
        pageDiv.innerHTML = `
            <div class="page-number">Page ${page.pageNumber}</div>
            <div class="page-controls">
                <select id="color_${index}" data-page-index="${index}" data-setting="colorMode">
                    <option value="bw" ${page.colorMode === 'bw' ? 'selected' : ''}>Black & White</option>
                    <option value="color" ${page.colorMode === 'color' ? 'selected' : ''}>Color</option>
                </select>
                <select id="orientation_${index}" data-page-index="${index}" data-setting="orientation">
                    <option value="portrait" ${page.orientation === 'portrait' ? 'selected' : ''}>Portrait</option>
                    <option value="landscape" ${page.orientation === 'landscape' ? 'selected' : ''}>Landscape</option>
                </select>
            </div>
        `;
        container.appendChild(pageDiv);
    });
    
    // Add event listeners to the new selects
    document.querySelectorAll('.page-controls select').forEach(select => {
        select.addEventListener('change', handlePageSettingChange);
    });
    
    updateFileSettingsSummary();
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function handlePageSettingChange(e) {
    const select = e.target;
    const pageIndex = parseInt(select.dataset.pageIndex);
    const setting = select.dataset.setting;
    const value = select.value;
    
    const file = uploadedFiles.find(f => f.id === currentFileId);
    if (file && file.pageSettings[pageIndex]) {
        file.pageSettings[pageIndex][setting] = value;
        updateFileSettingsSummary();
    }
}

function updateFileSettingsSummary() {
    const file = uploadedFiles.find(f => f.id === currentFileId);
    if (!file) return;
    
    let bwCount = 0;
    let colorCount = 0;
    let portraitCount = 0;
    let landscapeCount = 0;
    
    file.pageSettings.forEach(page => {
        if (page.colorMode === 'color') colorCount++;
        else bwCount++;
        
        if (page.orientation === 'portrait') portraitCount++;
        else landscapeCount++;
    });
    
    const summary = document.getElementById('fileSettingsSummary');
    summary.innerHTML = `
        <strong>Summary:</strong><br>
        • ${bwCount} pages in Black & White (₹${bwCount * 2})<br>
        • ${colorCount} pages in Color (₹${colorCount * 10})<br>
        • ${portraitCount} pages in Portrait, ${landscapeCount} pages in Landscape<br>
        <strong>File Total: ₹${(bwCount * 2) + (colorCount * 10)}</strong>
    `;
    summary.style.display = 'block';
}

function closeFileSettings() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    currentFileId = null;
    currentPreviewFile = null;
    filePreview.style.display = 'none';
    previewContent.innerHTML = '';
    
    // Update the main view to reflect any changes
    renderFileList();
    updateSummary();
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeFileSettings();
    }
});

// Close modal with escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeFileSettings();
    }
});

// Submit handler
async function handleSubmit() {
    const studentName = document.getElementById('studentName').value.trim();
    const studentId = document.getElementById('studentId').value.trim();
    
    if (!studentName || !studentId) {
        alert('Please fill in all student information');
        return;
    }
    
    if (uploadedFiles.length === 0) {
        alert('Please upload at least one file');
        return;
    }
    
    // Show loading state
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    
    try {
        const formData = new FormData();
        formData.append('studentName', `${studentName}_${studentId}`);
        
        // Add all files to form data
        for (const fileObj of uploadedFiles) {
            formData.append('files', fileObj.file, fileObj.name);
        }
        
        // Send to our server
        const response = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Files uploaded successfully to Google Drive!\n\n' +
                  `Folder: ${studentName}_${studentId}\n` +
                  `Total Files: ${result.files.length}`);
            
            // Reset form
            document.getElementById('studentForm').reset();
            uploadedFiles = [];
            renderFileList();
            updateSummary();
        } else {
            throw new Error(result.error || 'Failed to upload files');
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert(`❌ Error: ${error.message}`);
    } finally {
        // Reset button
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Order';
    }
}

function resetForm() {
    // Clear form fields
    document.getElementById('studentName').value = '';
    document.getElementById('studentId').value = '';
    document.getElementById('studentPhone').value = '';
    
    // Reset file input
    fileInput.value = '';
    
    // Clear uploaded files
    uploadedFiles = [];
    totalPages = 0;
    
    // Update UI
    renderFileList();
    updateSummary();
    updateSubmitButton();
}

// Add click handler for file items to show preview
document.addEventListener('click', (e) => {
    const fileItem = e.target.closest('.file-item');
    if (fileItem && !e.target.closest('.file-actions')) {
        const fileId = fileItem.dataset.id;
        const file = uploadedFiles.find(f => f.id === fileId);
        if (file) {
            openFileSettings(fileId);
        }
    }
});

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    // Close modal button
    document.querySelector('.close').addEventListener('click', closeFileSettings);
    
    // Save settings button
    document.getElementById('saveSettingsBtn').addEventListener('click', closeFileSettings);
    
    // Initialize the file list
    renderFileList();
    updateSubmitButton();
});
