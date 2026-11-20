const { ApiError } = require('../errors');

function preventPhotoCaching(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.vary('Authorization');
  next();
}

function missingPhoto() {
  return new ApiError(404, 'photo not found', 'PHOTO_NOT_FOUND');
}

function sendPrivatePhoto(res, storedPath, directoryName, absoluteDirectory) {
  const prefix = `/uploads/${directoryName}/`;
  const filename = typeof storedPath === 'string' && storedPath.startsWith(prefix)
    ? storedPath.slice(prefix.length)
    : '';
  if (!/^[a-z0-9_-]+\.(?:jpe?g|png|apng|webp|gif|avif|heic|heif|bmp|ico|tiff?|jxl)$/i.test(filename)) {
    throw missingPhoto();
  }

  return new Promise((resolve, reject) => {
    res.sendFile(filename, {
      root: absoluteDirectory,
      acceptRanges: false,
      cacheControl: false
    }, error => {
      if (!error) resolve();
      else reject(error.status === 404 ? missingPhoto() : error);
    });
  });
}

module.exports = { preventPhotoCaching, sendPrivatePhoto };
