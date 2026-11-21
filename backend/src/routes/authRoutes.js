const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const defaultAuthService = require('../services/authService');
const defaultSecurityService = require('../services/securityService');
const { ApiError } = require('../errors');
const { asyncHandler } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const { sendCreated, sendData } = require('../response');

function safeSecretEqual(input, expected) {
  const left = crypto.createHash('sha256').update(String(input || '')).digest();
  const right = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function requireText(value, name, { min = 1, max = 255 } = {}) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) {
    throw new ApiError(400, `${name} must be ${min} to ${max} characters`, 'INVALID_AUTH_INPUT');
  }
  return text;
}

function requireEmail(value) {
  const email = requireText(value, 'email', { min: 3, max: 255 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'email must be valid', 'INVALID_AUTH_INPUT');
  }
  return email;
}

function createAuthRouter(
  authService = defaultAuthService,
  securityService = defaultSecurityService,
  authConfig = config.auth
) {
  const router = express.Router();

  router.post(
    '/auth/register',
    asyncHandler(async (req, res) => {
      if (authConfig?.allowPublicRegistration === false) {
        await securityService.recordSecurityEvent?.({
          eventType: 'REGISTER_BLOCKED',
          result: 'failure',
          resourceType: 'auth',
          detail: { reason: 'REGISTRATION_DISABLED' },
          req
        });
        throw new ApiError(403, 'public registration is disabled', 'REGISTRATION_DISABLED');
      }

      const requiredCode = String(authConfig?.registrationInviteCode || '').trim();
      if (requiredCode) {
        const providedCode = String(req.body?.inviteCode || req.body?.invite_code || '').trim();
        if (!providedCode || !safeSecretEqual(providedCode, requiredCode)) {
          await securityService.recordSecurityEvent?.({
            eventType: 'REGISTER_BLOCKED',
            result: 'failure',
            resourceType: 'auth',
            detail: { reason: 'INVALID_INVITE_CODE' },
            req
          });
          throw new ApiError(403, 'valid invite code is required', 'INVALID_INVITE_CODE');
        }
      }

      const payload = {
        username: requireText(req.body.username, 'username', { min: 2, max: 80 }),
        email: requireEmail(req.body.email),
        password: requireText(req.body.password, 'password', { min: 8, max: 200 })
      };

      const result = await authService.register(payload);
      await securityService.recordSecurityEvent?.({
        userId: result?.user?.id,
        eventType: 'REGISTER_SUCCESS',
        result: 'success',
        resourceType: 'auth',
        resourceId: payload.email,
        req
      });
      sendCreated(res, result);
    })
  );

  router.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const email = requireEmail(req.body.email);
      const password = requireText(req.body.password, 'password', { min: 1, max: 200 });
      await securityService.assertLoginAllowed({ email, req });

      let result;
      try {
        result = await authService.login({ email, password });
      } catch (error) {
        const failureReason = error.code || 'LOGIN_FAILED';
        await securityService.recordLoginAttempt({
          email,
          success: false,
          failureReason,
          req
        });
        await securityService.recordSecurityEvent({
          eventType: 'LOGIN_FAILED',
          result: 'failure',
          resourceType: 'auth',
          resourceId: email,
          detail: { failureReason },
          req
        });
        throw error;
      }

      await securityService.recordLoginAttempt({
        email,
        userId: result.user.id,
        success: true,
        req
      });
      await securityService.recordSecurityEvent({
        userId: result.user.id,
        eventType: 'LOGIN_SUCCESS',
        result: 'success',
        resourceType: 'auth',
        resourceId: email,
        req
      });
      sendData(res, result);
    })
  );

  router.get(
    '/auth/me',
    authenticate(authService),
    asyncHandler(async (req, res) => {
      sendData(res, { user: req.user });
    })
  );

  router.put(
    '/auth/me/profile',
    authenticate(authService),
    asyncHandler(async (req, res) => {
      const bio = String(req.body.bio || '').trim();
      if (bio.length > 50) {
        throw new ApiError(400, 'bio must be at most 50 characters', 'INVALID_AUTH_INPUT');
      }
      sendData(res, { user: await authService.updateProfile(req.user.id, { bio }) });
    })
  );

  return router;
}

module.exports = createAuthRouter;
