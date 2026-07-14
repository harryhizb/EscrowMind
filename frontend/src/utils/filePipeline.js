import JSZip from 'jszip';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Packs multiple File objects into a single ZIP Blob.
 * @param {File[]} files
 * @returns {Promise<Blob>}
 */
export async function packZip(files) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file);
  }
  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Shared Upload function supporting one or multiple files.
 * If multiple files are provided, bundles them into a ZIP on the client side.
 * Tracks progress using XMLHttpRequest.
 * 
 * @param {File[]} files - Array of File objects
 * @param {object} callbacks - Upload lifecycle handlers
 * @param {function} callbacks.onProgress - Called with percent (0-100)
 * @param {function} callbacks.onSuccess - Called with JSON response {success: true, cid, hash}
 * @param {function} callbacks.onError - Called with Error object
 */
export function uploadFiles(files, { onProgress, onSuccess, onError }) {
  if (!files || files.length === 0) {
    onError(new Error('No files selected for upload.'));
    return;
  }

  const performUpload = (blobToUpload, fileName) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BACKEND_URL}/upload`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success) {
            onSuccess(res);
          } else {
            onError(new Error(res.error || 'Upload failed'));
          }
        } catch (e) {
          onError(new Error('Invalid server response'));
        }
      } else {
        onError(new Error(`Server returned status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      onError(new Error('Network error during upload'));
    });

    const formData = new FormData();
    formData.append('file', blobToUpload, fileName);
    xhr.send(formData);
  };

  if (files.length === 1) {
    const file = files[0];
    performUpload(file, file.name);
  } else {
    // Generate ZIP client-side
    packZip(files)
      .then((zipBlob) => {
        performUpload(zipBlob, `bundle-${Date.now()}.zip`);
      })
      .catch((err) => {
        onError(err);
      });
  }
}

/**
 * Shared Download function.
 * Given a CID/hash and a fallback name, downloads the raw binary,
 * determines the file extension/mime type from response headers,
 * and triggers a correct browser download using Blob.
 * 
 * @param {string} hashOrCid - IPFS CID or on-chain Keccak256 hash
 * @param {string} defaultName - Fallback name (used if headers don't specify one)
 * @param {object} callbacks - Download lifecycle handlers
 * @param {function} callbacks.onStart - Triggered before download starts
 * @param {function} callbacks.onSuccess - Triggered on completion
 * @param {function} callbacks.onError - Triggered with Error object
 */
export async function downloadFile(hashOrCid, defaultName, { onStart, onSuccess, onError }) {
  if (onStart) onStart();

  try {
    const response = await fetch(`${BACKEND_URL}/download/${hashOrCid}`);
    if (!response.ok) {
      throw new Error(`Failed to download: Server returned status ${response.status}`);
    }

    const blob = await response.blob();
    
    // Attempt to extract filename from Content-Disposition header
    let filename = defaultName;
    const disposition = response.headers.get('Content-Disposition');
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="(.+?)"/) || disposition.match(/filename=(.+)/);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '').trim();
      }
    }

    // Trigger browser download using Object URL
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    if (onSuccess) onSuccess();
  } catch (err) {
    if (onError) onError(err);
  }
}
