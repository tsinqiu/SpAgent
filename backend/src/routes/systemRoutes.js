const express = require('express');
const config = require('../config');
const defaultAuthService = require('../services/authService');
const coachOnlineService = require('../services/coachOnlineService');
const { asyncHandler } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const { sendData } = require('../response');

function createSystemRouter(authConfig = config.auth, authService = defaultAuthService) {
  const router = express.Router();

  router.get('/system/public-config', (req, res) => {
    const serviceHost = config.maps.amap.serviceHost || '';
    sendData(res, {
      auth: {
        allowPublicRegistration: authConfig?.allowPublicRegistration !== false,
        inviteCodeRequired: Boolean(String(authConfig?.registrationInviteCode || '').trim())
      },
      maps: {
        amap: {
          key: config.maps.amap.key,
          serviceHost,
          // When production reverse-proxy serviceHost is configured, omit raw securityCode from browser response
          securityCode: serviceHost ? '' : config.maps.amap.securityCode
        }
      }
    });
  });

  router.get(
    '/system/live-weather',
    authenticate(authService),
    asyncHandler(async (req, res) => {
      const city = String(req.query.city || '无锡').trim().slice(0, 60) || '无锡';
      const weather = await coachOnlineService.getLiveWeatherAndAqi({ city, days: 1 });
      sendData(res, weather);
    })
  );

  return router;
}

module.exports = createSystemRouter;
