const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spagent-private-photos-'));
const directories = new Map([
  ['activity-images', 'ACTIVITY_IMAGE_UPLOAD_DIR'], ['shoe-images', 'SHOE_IMAGE_UPLOAD_DIR'],
  ['community-images', 'COMMUNITY_IMAGE_UPLOAD_DIR'], ['explore-images', 'EXPLORE_IMAGE_UPLOAD_DIR'],
  ['explore-videos', 'EXPLORE_VIDEO_UPLOAD_DIR']
]);
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n3cAAAAASUVORK5CYII=', 'base64');
const filename = '123-abcdef0123456789.png';
const followersFilename = '123-abcd012345678922.png';
const privateFilename = '123-abcd012345678933.png';
process.env.UPLOAD_ROOT = root;
for (const [directory, variable] of directories) {
  const entry = path.join(root, directory);
  process.env[variable] = entry;
  fs.mkdirSync(entry);
  fs.writeFileSync(path.join(entry, filename), photo);
}
for (const name of [followersFilename, privateFilename]) fs.writeFileSync(path.join(root, 'community-images', name), photo);

const createApp = require('../src/app');
const db = require('../src/db');
const { ApiError } = require('../src/errors');

after(() => {
  for (const name of [followersFilename, privateFilename]) fs.unlinkSync(path.join(root, 'community-images', name));
  for (const directory of directories.keys()) {
    fs.unlinkSync(path.join(root, directory, filename));
    fs.rmdirSync(path.join(root, directory));
  }
  fs.rmdirSync(root);
});

test('private photo reads require a bearer token and the stored owner relationship', async (t) => {
  const authService = {
    async verifyToken(token) {
      if (!['owner', 'follower', 'other', 'admin'].includes(token)) throw new ApiError(401, 'invalid token', 'INVALID_TOKEN');
      return { id: { owner: 41, follower: 42, other: 49, admin: 49 }[token], role: token === 'admin' ? 'admin' : 'user' };
    }
  };
  t.mock.method(db, 'query', async (sql, params) => {
    if (/FROM Activities/.test(sql)) {
      const [id] = params;
      if (id === 1) return [{ id, ownerUserId: 41, photoPath: `/uploads/activity-images/${filename}` }];
      if (id === 2) return [{ id, ownerUserId: 41, photoPath: '/uploads/activity-images/missing.png' }];
      if (id === 3) return [{ id, ownerUserId: 41, photoPath: `/uploads/community-images/${filename}` }];
      return [];
    }
    if (/FROM CommunityPosts p/.test(sql)) {
      const [id, owner] = params;
      assert.match(sql, /p\.visibility = 'public'/);
      if (owner) assert.match(sql, /p\.user_id = \?[\s\S]*p\.visibility = 'followers'[\s\S]*vf\.follower_user_id = \?/);
      if (id === 1) return [{ imagePath: `/uploads/community-images/${filename}` }];
      if (id === 2 && [41, 42].includes(owner)) return [{ imagePath: `/uploads/community-images/${followersFilename}` }];
      if (id === 3 && owner === 41) return [{ imagePath: `/uploads/community-images/${privateFilename}` }];
      return [];
    }
    if (/FROM CommunityPosts/.test(sql)) {
      assert.match(sql, /visibility = 'public'/);
      const imagePath = `/uploads/community-images/${filename}`;
      return imagePath === params[0] ? [{ imagePath }] : [];
    }
    const [id, userId] = params;
    if (id === 1 && userId === 41) return [{ id, photoPath: `/uploads/shoe-images/${filename}` }];
    return [];
  });
  const app = request(createApp({ authService }));
  for (const [collection, directory] of [['activities', 'activity-images'], ['shoes', 'shoe-images']]) {
    const route = `/api/${collection}/1/photo`;
    await app.get(`/uploads/${directory}/${filename}`).expect(404);
    await app.get(`/uploads/${directory}/${filename}`).set('Authorization', 'Bearer owner').expect(404);
    await app.get(route).expect(401).expect('Cache-Control', 'private, no-store');
    await app.head(route).expect(401);
    await app.get(`${route}?token=owner`).expect(401);
    await app.get(route).set('Authorization', 'Bearer other').expect(404).expect('Cache-Control', 'private, no-store');
    const image = await app.get(route).set('Authorization', 'Bearer owner').expect(200).expect('Content-Type', 'image/png');
    assert.deepEqual(image.body, photo);
    assert.equal(image.headers['cache-control'], 'private, no-store');
  }
  await app.get('/api/activities/1/photo').set('Authorization', 'Bearer admin').expect(200);
  await app.get('/api/shoes/1/photo').set('Authorization', 'Bearer admin').expect(404);
  await app.get('/api/activities/2/photo').set('Authorization', 'Bearer owner').expect(404);
  await app.get('/api/activities/3/photo').set('Authorization', 'Bearer owner').expect(404);
  await app.get('/uploads/community-images/' + filename).expect(200).expect('Content-Type', 'image/png');
  await app.get('/uploads/community-images/' + followersFilename).expect(404);
  await app.get('/uploads/community-images/' + privateFilename).expect(404);
  await app.get('/api/community/posts/1/image').expect(200);
  await app.get('/api/community/posts/2/image').expect(404);
  await app.get('/api/community/posts/2/image').set('Authorization', 'Bearer other').expect(404);
  await app.get('/api/community/posts/2/image').set('Authorization', 'Bearer follower').expect(200);
  await app.get('/api/community/posts/3/image').set('Authorization', 'Bearer follower').expect(404);
  await app.get('/api/community/posts/3/image').set('Authorization', 'Bearer owner').expect(200);
  await app.get('/uploads/explore-images/' + filename).expect(200).expect('Content-Type', 'image/png');
  await app.get('/uploads/explore-videos/' + filename).expect(200);

  const response = await app.post('/api/shoes').set('Authorization', 'Bearer other')
    .send({ name: 'Synthetic shoe', photoPath: `/uploads/shoe-images/${filename}` }).expect(400);
  assert.equal(response.body.error.code, 'INVALID_UPLOAD');
  await app.post('/api/community/posts').set('Authorization', 'Bearer other')
    .send({ content: 'Synthetic post', activityId: 1 }).expect(404);
});
