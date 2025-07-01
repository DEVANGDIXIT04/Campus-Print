require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const Jimp = require('jimp');
const { PDFDocument } = require('pdf-lib');
const { fromBuffer } = require('pdf2pic');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize Google Drive
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json', // You'll need to create this file
    scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

// Create folder in Google Drive
async function createFolder(folderName, parentId = null) {
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId && { parents: [parentId] })
    };

    try {
        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });
        return folder.data.id;
    } catch (error) {
        console.error('Error creating folder:', error);
        throw error;
    }
}

// Convert image to black and white
async function convertToBW(imagePath) {
    try {
        const image = await Jimp.read(imagePath);
        await image.grayscale()
                  .contrast(0.2)  // Slight contrast boost for better B&W
                  .writeAsync(imagePath);
        return true;
    } catch (error) {
        console.error('Error converting image to B&W:', error);
        return false;
    }
}

// Convert PDF to black and white
async function convertPdfToBW(pdfPath) {
    try {
        // This is a simplified example - for production, you might want to use a more robust solution
        // like Ghostscript or a dedicated PDF processing service
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        // For each page, we'd need to render it as an image, convert to B&W, and then save back
        // This is a complex operation that's simplified here
        // In a real app, you might want to use a service like pdf2pic
        
        // For now, we'll just return the original PDF
        // In a production app, implement proper PDF processing here
        return true;
    } catch (error) {
        console.error('Error converting PDF to B&W:', error);
        return false;
    }
}

// Upload file to Google Drive with optional B&W conversion
async function uploadFile(filePath, folderId, fileName, convertToBWFlag = false) {
    try {
        // Handle B&W conversion if needed
        if (convertToBWFlag) {
            const ext = path.extname(fileName).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                await convertToBW(filePath);
            } else if (ext === '.pdf') {
                await convertPdfToBW(filePath);
            }
        }

        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [folderId]
            },
            media: {
                mimeType: 'application/octet-stream',
                body: fs.createReadStream(filePath)
            },
            fields: 'id,webViewLink'
        });
        
        return response.data;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
    } finally {
        // Clean up the temporary file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

// Upload endpoint
app.post('/api/upload', upload.array('files'), async (req, res) => {
    try {
        const { studentName, fileSettings } = req.body;
        if (!studentName) {
            return res.status(400).json({ error: 'Student name is required' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        // Parse file settings if provided
        let settings = {};
        try {
            settings = fileSettings ? JSON.parse(fileSettings) : {};
        } catch (e) {
            console.error('Error parsing file settings:', e);
        }

        // Create student folder in Google Drive
        const folderId = await createFolder(studentName, process.env.GOOGLE_DRIVE_FOLDER_ID);
        
        // Upload each file
        const uploadResults = [];
        for (const file of req.files) {
            const fileSetting = settings[file.originalname] || {};
            const convertToBW = fileSetting.colorMode === 'bw';
            
            const result = await uploadFile(
                file.path, 
                folderId, 
                file.originalname,
                convertToBW
            );
            
            uploadResults.push({
                name: file.originalname,
                id: result.id,
                url: result.webViewLink,
                colorMode: fileSetting.colorMode || 'color'
            });
        }

        res.json({
            success: true,
            message: 'Files uploaded successfully',
            folderId,
            files: uploadResults
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to upload files',
            details: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
