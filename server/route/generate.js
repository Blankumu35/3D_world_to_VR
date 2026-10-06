// Text-to-3D generation. Stubbed until a provider is chosen (Phase 4).
// The intended shape is a job API, because generation takes far longer
// than a single request should stay open:
//   POST /api/generate        { prompt }  -> 202 { jobId }
//   GET  /api/generate/:jobId             -> { status, assetId? , error? }

import express from 'express';

const router = express.Router();

router.use((req, res) => {
  res.status(501).json({ error: 'Generation is not implemented yet.' });
});

export default router;