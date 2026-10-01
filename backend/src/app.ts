import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { originCheckMiddleware } from './middleware/originCheck.js';
import { securityHeadersMiddleware } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import enhanceRoutes from './routes/enhance.js';
import projectRoutes from './routes/projects.js';
import shareRoutes from './routes/share.js';
import subscriptionRoutes from './routes/subscriptions.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.set('trust proxy', true);

// 1. Request Correlation ID & Security Headers
app.use(requestIdMiddleware);
app.use(securityHeadersMiddleware);

// 2. Dynamic CORS Configuration derived from config runtime binding
app.use(
  cors({
    origin: (_reqOrigin, callback) => {
      callback(null, config.corsOrigin);
    },
    credentials: true,
  })
);

// 2b. CSRF defense: reject state-changing requests from foreign browser origins
app.use(originCheckMiddleware);

// 3. Request Parsers
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// 4. API Routes (/api/v1 & /api compatibility)
const v1Router = express.Router();

v1Router.use('/', healthRoutes);
v1Router.use('/auth', authRoutes);
v1Router.use('/', subscriptionRoutes);
v1Router.use('/', enhanceRoutes);
v1Router.use('/projects', projectRoutes);
v1Router.use('/share', shareRoutes);
v1Router.use('/admin', adminRoutes);

app.use('/health', (req, res, next) => {
  req.url = '/health';
  healthRoutes(req, res, next);
});
app.use('/api/v1', v1Router);
app.use('/api', v1Router);



// 5. Centralized Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
