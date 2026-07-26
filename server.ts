import express from "express";
import path from "path";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as xlsx from "xlsx";
import Tesseract from "tesseract.js";

// Setup multer for handling file uploads (stored in memory)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON
  app.use(express.json());

  app.post("/api/convert-file", (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: "File upload error: " + err.message });
      } else if (err) {
        return res.status(500).json({ error: "Unknown error during file upload: " + err.message });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const mimeType = req.file.mimetype;
      const originalName = req.file.originalname.toLowerCase();
      let extractedText = "";

      if (mimeType === 'application/pdf' || originalName.endsWith('.pdf')) {
        try {
          const data = await pdfParse(req.file.buffer);
          extractedText = data.text;
        } catch (pdfError: any) {
          console.error("PDF Parse Error:", pdfError);
          return res.status(500).json({ error: "Failed to parse PDF: " + pdfError.message });
        }
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || originalName.endsWith('.docx')) {
        try {
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          extractedText = result.value;
        } catch (docxErr: any) {
           console.error("DOCX Parse Error:", docxErr);
           return res.status(500).json({ error: "Failed to parse DOCX: " + docxErr.message });
        }
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || originalName.endsWith('.xlsx')) {
        try {
          const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
          workbook.SheetNames.forEach(sheetName => {
            extractedText += `\n\n## Sheet: ${sheetName}\n\n`;
            const worksheet = workbook.Sheets[sheetName];
            
            const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
            
            if (jsonData.length > 0) {
                const maxCols = Math.max(...jsonData.map(row => row.length));
                
                jsonData.forEach((row, rowIndex) => {
                    const paddedRow = Array.from({ length: maxCols }, (_, i) => {
                        const cellValue = row[i];
                        return cellValue !== undefined && cellValue !== null ? String(cellValue).replace(/\n/g, ' ') : '';
                    });
                    
                    extractedText += "| " + paddedRow.join(" | ") + " |\n";
                    
                    if (rowIndex === 0) {
                        extractedText += "| " + Array(maxCols).fill("---").join(" | ") + " |\n";
                    }
                });
            }
          });
        } catch (xlsxErr: any) {
           console.error("XLSX Parse Error:", xlsxErr);
           return res.status(500).json({ error: "Failed to parse XLSX: " + xlsxErr.message });
        }
      } else if (mimeType.startsWith('image/') || /\.(png|jpe?g|bmp|webp)$/i.test(originalName)) {
        try {
          const result = await Tesseract.recognize(req.file.buffer, 'eng+vie+chi_sim+kor+jpn');
          extractedText = result.data.text;
        } catch (imgErr: any) {
           console.error("Image Parse Error:", imgErr);
           return res.status(500).json({ error: "Failed to parse image: " + imgErr.message });
        }
      } else {
        return res.status(400).json({ error: "Unsupported file type. Please upload a PDF, DOCX, XLSX, or Image file." });
      }

      return res.json({ markdown: extractedText });

    } catch (error: any) {
      console.error("Error during file conversion:", error);
      res.status(500).json({ error: "Internal server error: " + (error.message || "Unknown error") });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler to always return JSON for API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Server Error:", err);
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: "Internal server error: " + (err.message || "Unknown error") });
    } else {
      next(err);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
