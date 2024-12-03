const express = require('express');
const router = express.Router();
const DynamicModel = require('../Models/section');

// GET all documents
router.get('/documents', async (req, res) => {
  try {
    const documents = await DynamicModel.find({}, 'fileName createdAt');
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Error fetching documents' });
  }
});

// GET single document by ID
router.get('/documents/:id', async (req, res) => {
  try {
    const document = await DynamicModel.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Error fetching document' });
  }
});

// POST new document
router.post('/store-document', async (req, res) => {
  try {
    const { content, fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const document = new DynamicModel({
      content,
      fileName,
    });

    const savedDocument = await document.save();
    res.status(201).json({
      message: 'Document stored successfully',
      documentId: savedDocument._id,
      document: savedDocument
    });
  } catch (error) {
    console.error('Error storing document:', error);
    res.status(500).json({ error: 'Error storing document' });
  }
});

// PUT update existing document
router.put('/documents/:id', async (req, res) => {
  try {
    const { content, fileName } = req.body;
    
    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const updatedDocument = await DynamicModel.findByIdAndUpdate(
      req.params.id,
      {
        content,
        fileName,
      },
      { new: true } // Returns the updated document
    );

    if (!updatedDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      message: 'Document updated successfully',
      document: updatedDocument
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Error updating document' });
  }
});

// DELETE document
router.delete('/documents/:id', async (req, res) => {
  try {
    const document = await DynamicModel.findByIdAndDelete(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Error deleting document' });
  }
});

module.exports = router;
