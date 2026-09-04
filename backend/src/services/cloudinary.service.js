const cloudinary = require("cloudinary").v2;
const config = require("../core/config");

let configured = false;

function isConfigured() {
  return Boolean(
    config.cloudinaryCloudName &&
    config.cloudinaryApiKey &&
    config.cloudinaryApiSecret
  );
}

function ensureConfigured() {
  if (!configured) {
    if (!isConfigured()) {
      const err = new Error("Cloudinary is not configured");
      err.statusCode = 500;
      throw err;
    }
    cloudinary.config({
      cloud_name: config.cloudinaryCloudName,
      api_key: config.cloudinaryApiKey,
      api_secret: config.cloudinaryApiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

async function uploadAvatar(buffer, options = {}) {
  const client = ensureConfigured();
  const result = await new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: "aether/profile-avatars",
        resource_type: "image",
        ...options,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
  return result;
}

async function uploadImage(buffer, options = {}) {
  const client = ensureConfigured();
  const result = await new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: "aether/artifacts",
        resource_type: "image",
        ...options,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
  return result;
}

function getPublicIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/\/v\d+\/(.+)$/);
  if (!match) return null;
  return match[1];
}

async function deleteImage(publicId) {
  const client = ensureConfigured();
  try {
    await client.uploader.destroy(publicId);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { isConfigured, uploadAvatar, uploadImage, deleteImage, getPublicIdFromUrl };
