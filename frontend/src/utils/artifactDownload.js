function collectImageCandidates(content) {
  const candidates = [];
  if (typeof content === "string") {
    candidates.push(content);
  } else if (content && typeof content === "object") {
    for (const key of ["data", "image", "imageData", "imageUrl", "url", "secureUrl", "content", "src"]) {
      const value = content[key];
      if (typeof value === "string") candidates.push(value);
    }
  }
  return candidates;
}

function imageExtensionForMime(mime) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

function baseFileName(name) {
  return (name || "artifact").replace(/[^a-zA-Z0-9_\-. ]/g, "_");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(content, name) {
  const value = content && typeof content === "object" ? content : { content };
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${baseFileName(name)}.json`);
}

function withExtension(name, ext) {
  const safe = baseFileName(name);
  return safe.toLowerCase().endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;
}

export default function downloadArtifactFile(content, name) {
  const dataUri = collectImageCandidates(content).find((candidate) =>
    /^data:image\/[\w.+-]+;base64,/i.test(candidate)
  );

  if (dataUri) {
    const comma = dataUri.indexOf(",");
    const mime = (dataUri.slice(5, comma).split(";")[0] || "image/png").toLowerCase();
    const ext = imageExtensionForMime(mime);
    const binary = atob(dataUri.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    downloadBlob(new Blob([bytes], { type: mime }), withExtension(name, ext));
    return;
  }

  const imageUrl = collectImageCandidates(content).find((candidate) =>
    /^https?:\/\/.+(\.(png|jpe?g|webp|gif))([?#].*)?$/i.test(candidate)
  );

  if (imageUrl) {
    const match = imageUrl.match(/\.(png|jpe?g|webp|gif)\b/i);
    const ext = (match ? match[1].toLowerCase() : "png").replace("jpeg", "jpg");
    fetch(imageUrl, { credentials: "omit" })
      .then((res) => {
        if (!res.ok) throw new Error("download failed");
        return res.blob();
      })
      .then((blob) => {
        if (blob.type && blob.type.startsWith("image/")) {
          downloadBlob(blob, withExtension(name, ext));
        } else {
          downloadJson(content, name);
        }
      })
      .catch(() => downloadJson(content, name));
    return;
  }

  downloadJson(content, name);
}