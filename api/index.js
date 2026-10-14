// Vercel serverless entry — wraps the Express app.
// All /api/* routes are handled here; Vercel routes them via vercel.json.
import app from "../uwian/server/src/index.js";
export default app;
