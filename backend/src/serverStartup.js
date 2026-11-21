function startupErrorMessage(error, host, port) {
  if (error.code === 'EADDRINUSE') {
    return `Failed to start SpAgent API: ${host}:${port} is already in use`;
  }
  if (error.code === 'EACCES') {
    return `Failed to start SpAgent API: permission denied for ${host}:${port}`;
  }
  return `Failed to start SpAgent API: ${error.message}`;
}

function validateProductionConfig(cfg, nodeEnv = process.env.NODE_ENV, logger = console) {
  if (nodeEnv !== 'production') {
    return { ok: true, warnings: [] };
  }

  const errors = [];
  const warnings = [];

  const jwtSecret = String(cfg?.auth?.jwtSecret || '').trim();
  if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production');
  }

  if (!String(cfg?.db?.password || '').trim()) {
    errors.push('DB_PASSWORD must be non-empty in production');
  }

  const origins = cfg?.cors?.origins || [];
  if (origins.includes('*')) {
    errors.push('CORS_ORIGIN must not contain wildcard "*" in production');
  }

  if (cfg?.server?.host === '0.0.0.0' && !cfg?.security?.trustProxy) {
    warnings.push('HOST=0.0.0.0 without TRUST_PROXY=true: bind Express to 127.0.0.1 behind Nginx in production');
  }

  if (cfg?.auth?.allowPublicRegistration !== false && !String(cfg?.auth?.registrationInviteCode || '').trim()) {
    warnings.push('Public registration is open without REGISTRATION_INVITE_CODE; set an invite code or ALLOW_PUBLIC_REGISTRATION=false to protect AI API quotas');
  }

  for (const warning of warnings) {
    logger.warn?.(`[SpAgent security warning] ${warning}`);
  }

  if (errors.length) {
    throw new Error(`Unsafe production configuration: ${errors.join('; ')}`);
  }

  return { ok: true, warnings };
}

function startServer({
  app,
  host,
  port,
  logger = console,
  onError = () => {
    process.exitCode = 1;
  }
}) {
  return app.listen(port, host, (error) => {
    if (error) {
      logger.error(startupErrorMessage(error, host, port));
      onError(error);
      return;
    }
    logger.log(`SpAgent API listening on http://${host}:${port}`);
  });
}

module.exports = {
  startServer,
  startupErrorMessage,
  validateProductionConfig
};
