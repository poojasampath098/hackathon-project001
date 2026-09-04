const { Router } = require("express");
const multer = require("multer");
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/user.controller");

const router = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error("Only jpg, jpeg, png and webp images are allowed");
      err.statusCode = 400;
      cb(err);
    }
  },
});

function handleAvatarUpload(req, res, next) {
  avatarUpload.single("avatar")(req, res, (err) => {
    if (err) {
      if (!err.statusCode) err.statusCode = 400;
      return next(err);
    }
    return next();
  });
}

router.use(authenticate);

router.get("/profile", ctrl.getProfile);
router.put("/profile", ctrl.updateProfile);
router.post("/profile/avatar", handleAvatarUpload, ctrl.uploadAvatar);
router.delete("/account", ctrl.deleteAccount);

module.exports = router;
