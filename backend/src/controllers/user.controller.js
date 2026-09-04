const User = require("../db/models/user.model");
const userRepo = require("../db/repositories/user.repository");
const cloudinaryService = require("../services/cloudinary.service");

async function getProfile(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.user.userId, isDeleted: { $ne: true } }).select("-passwordHash");
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      data: { user: user.toJSON() },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { email, firstName, lastName, avatar } = req.body;
    const userId = req.user.userId;

    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: userId }, isDeleted: { $ne: true } });
      if (existing) {
        const err = new Error("Email already in use");
        err.statusCode = 409;
        return next(err);
      }
    }

    const update = {};
    if (email !== undefined) update.email = email;
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;
    if (avatar !== undefined) update.avatar = avatar;

    if (Object.keys(update).length === 0) {
      const err = new Error("No fields to update");
      err.statusCode = 400;
      return next(err);
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, isDeleted: { $ne: true } },
      { $set: update },
      { returnDocument: "after" }
    ).select("-passwordHash");
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      message: "Profile updated",
      data: { user: user.toJSON() },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    const userId = req.user.userId;

    if (!req.file) {
      const err = new Error("No image file provided");
      err.statusCode = 400;
      return next(err);
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      const err = new Error("Only jpg, jpeg, png and webp images are allowed");
      err.statusCode = 400;
      return next(err);
    }

    const user = await User.findOne({ _id: userId, isDeleted: { $ne: true } });
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }

    let uploaded;
    try {
      uploaded = await cloudinaryService.uploadAvatar(req.file.buffer, {
        public_id: `avatar_${userId}`,
        overwrite: true,
        transformation: [{ width: 400, height: 400, crop: "limit" }],
      });
    } catch (cloudErr) {
      const err = new Error("Failed to upload image");
      err.statusCode = 500;
      return next(err);
    }

    const newPublicId = uploaded.public_id;
    const newAvatarUrl = uploaded.secure_url;

    const previousPublicId = cloudinaryService.getPublicIdFromUrl(user.avatar);
    if (previousPublicId && previousPublicId !== newPublicId) {
      try {
        await cloudinaryService.deleteImage(previousPublicId);
      } catch (cleanupErr) {
        // Cleanup of the previous Cloudinary asset must never break this update.
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, isDeleted: { $ne: true } },
      { $set: { avatar: newAvatarUrl } },
      { returnDocument: "after" }
    ).select("-passwordHash");

    res.status(200).json({
      success: true,
      message: "Profile photo updated",
      data: { user: updatedUser.toJSON(), publicId: newPublicId },
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const userId = req.user.userId;

    const result = await userRepo.softDeleteUser(userId);
    if (!result) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }

    res.status(200).json({
      success: true,
      message: "Account deleted",
    });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
}

module.exports = { getProfile, updateProfile, uploadAvatar, deleteAccount };
