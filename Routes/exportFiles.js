// documentProcessor.js
const express = require('express');
const router = express.Router();
const mammoth = require('mammoth');
const docx = require('docx');
const PDFDocument = require('pdfkit');
const { Document, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, Packer } = docx;

class DocumentProcessor {
  constructor() {
    this.formatting = {
      defaultFontFamily: 'Arial',
      defaultFontSize: 11,
      lineSpacing: 1.15
    };
  }

  async extractDocument(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return this.parseContent(result.value);
    } catch (error) {
      console.error('Error extracting document:', error);
      throw error;
    }
  }

  parseContent(content) {
    return {
      textBoxes: this.splitIntoTextBoxes(content),
      tables: this.extractTables(content)
    };
  }

  splitIntoTextBoxes(content) {
    return content
      .split(/\n\s*\n/)
      .filter(text => text.trim())
      .map(text => ({
        content: text.trim(),
        formatting: this.detectFormatting(text)
      }));
  }

  extractTables(content) {
    const tableRegex = /[\|\+][-\+]*[\|\+]|(?:\s*\|[^|\n]+\|\s*\n)+/g;
    const tables = content.match(tableRegex) || [];
    return tables.map(tableContent => this.parseTable(tableContent));
  }

  parseTable(tableContent) {
    const rows = tableContent.split('\n').filter(row => row.trim());
    return rows.map(row => {
      return row
        .split('|')
        .filter(cell => cell.trim())
        .map(cell => ({
          content: cell.trim(),
          formatting: this.detectFormatting(cell)
        }));
    });
  }

  detectFormatting(text) {
    return {
      isBold: /\*\*(.*?)\*\*/.test(text),
      isItalic: /\_(.*?)\_/.test(text),
      isHeader: /^#+\s/.test(text),
      alignment: this.detectAlignment(text)
    };
  }

  detectAlignment(text) {
    if (text.trim().startsWith(':') && text.trim().endsWith(':')) return 'center';
    if (text.trim().endsWith(':')) return 'right';
    return 'left';
  }

  async generatePreview(content) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: this.generateDocumentElements(content)
      }]
    });
    return doc;
  }

  generateDocumentElements(content) {
    const elements = [];

    content.textBoxes.forEach(textBox => {
      elements.push(
        new Paragraph({
          text: textBox.content,
          ...this.applyFormatting(textBox.formatting)
        })
      );
    });

    content.tables.forEach(table => {
      elements.push(
        new Table({
          rows: table.map(row =>
            new TableRow({
              children: row.map(cell =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: cell.content,
                          ...this.applyFormatting(cell.formatting)
                        })
                      ]
                    })
                  ]
                })
              )
            })
          )
        })
      );
    });

    return elements;
  }

  applyFormatting(formatting) {
    return {
      bold: formatting.isBold,
      italic: formatting.isItalic,
      heading: formatting.isHeader,
      alignment: formatting.alignment,
      font: this.formatting.defaultFontFamily,
      size: this.formatting.defaultFontSize
    };
  }
}

// Create an instance of DocumentProcessor
const documentProcessor = new DocumentProcessor();

// Helper Functions
const createDocxIndexTable = (indexData = []) => {
    const rows = indexData.map(row => {
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: row.sno.toString(), size: 24 })] })],
            width: { size: 1000, type: WidthType.DXA },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: row.particulars, size: 24 })] })],
            width: { size: 7000, type: WidthType.DXA },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: row.pageNo.toString(), size: 24 })] })],
            width: { size: 1000, type: WidthType.DXA },
          }),
        ],
      });
    });
  
    return new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'S.NO.', bold: true, size: 24 })] })],
              width: { size: 1000, type: WidthType.DXA },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'PARTICULARS', bold: true, size: 24 })] })],
              width: { size: 7000, type: WidthType.DXA },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'PAGE NO.', bold: true, size: 24 })] })],
              width: { size: 1000, type: WidthType.DXA },
            }),
          ],
        }),
        ...rows,
      ],
      width: { size: 9000, type: WidthType.DXA },
    });
  };

const createPdfIndexTable = (doc, indexData) => {
  doc.fontSize(12);
  doc.text('S.NO.\t\tPARTICULARS\t\tPAGE NO.', { underline: true });

  indexData.forEach(row => {
    doc.text(`${row.sno}\t\t${row.particulars}\t\t${row.pageNo}`);
  });
};

// Routes
router.post('/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.document) {
      return res.status(400).send('No document uploaded');
    }

    const document = req.files.document;
    const filePath = `./uploads/${document.name}`;
    
    await document.mv(filePath);
    const content = await documentProcessor.extractDocument(filePath);
    res.json(content);
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).send('Error processing document');
  }
});


router.post('/export/pdf', (req, res) => {
    const { sections, indexData } = req.body;
    const doc = new PDFDocument();
    const filename = `legal-document-${Date.now()}.pdf`;
  
    try {
      res.setHeader('Content-disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-type', 'application/pdf');
      doc.pipe(res);
  
      // Add the index table
      doc.fontSize(16).text('Index', { align: 'center' });
      doc.moveDown();
      createPdfIndexTable(doc, indexData);
  
      // Add the sections
      sections.forEach((section, index) => {
        if (typeof section === 'object' && section.content) {
          doc.fontSize(14).text(section.content, { align: 'left', paragraphGap: 20 });
          doc.moveDown();
        }
      });
  
      doc.end();
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).send({ error: 'Failed to generate PDF' });
    }
  });
  
  router.post('/export/docx', async (req, res) => {
    const { sections, indexData } = req.body;
    const filename = `legal-document-${Date.now()}.docx`;
  
    const children = [];
    // Add the index table
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Index', bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
    }));
    children.push(createDocxIndexTable(indexData));
    children.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 240, after: 240 } }));
  
    // Add the sections
    sections.forEach((section, index) => {
      if (typeof section === 'object' && section.content) {
        children.push(new Paragraph({
          children: [new TextRun({ text: section.content, size: 28 })],
          alignment: AlignmentType.LEFT,
          spacing: { before: 240, after: 240, line: 360, lineRule: 'auto' },
        }));
      }
    });
  
    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        children: children,
      }],
    });
  
    try {
      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(buffer);
    } catch (error) {
      console.error('Error generating DOCX:', error);
      res.status(500).send({ error: 'Failed to generate DOCX' });
    }
  });

module.exports = router;