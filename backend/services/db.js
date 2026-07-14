const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'local_ipfs_cache', 'messages.json');

function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([]));
  }
}

function readMessages() {
  initDb();
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function writeMessages(messages) {
  initDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(messages, null, 2));
}

module.exports = {
  getMessages: (jobId, viewerAddress, otherAddress) => {
    const messages = readMessages();
    const filtered = messages.filter(m => String(m.jobId) === String(jobId));
    const viewer = viewerAddress.toLowerCase();
    const other = otherAddress ? otherAddress.toLowerCase() : null;

    return filtered.filter(m => {
      const sender = m.senderAddress.toLowerCase();
      const recipient = m.recipientAddress.toLowerCase();
      if (other) {
        return (sender === viewer && recipient === other) || (sender === other && recipient === viewer);
      } else {
        return sender === viewer || recipient === viewer;
      }
    }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },
  addMessage: (jobId, senderAddress, recipientAddress, content) => {
    const messages = readMessages();
    const newMessage = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      jobId: String(jobId),
      senderAddress: senderAddress.toLowerCase(),
      recipientAddress: recipientAddress.toLowerCase(),
      content: content,
      createdAt: new Date().toISOString()
    };
    messages.push(newMessage);
    writeMessages(messages);
    return newMessage;
  },
  getLatestMessageTimestamps: (viewerAddress) => {
    const messages = readMessages();
    const viewer = viewerAddress.toLowerCase();
    const res = {};
    for (const m of messages) {
      if (m.senderAddress.toLowerCase() === viewer || m.recipientAddress.toLowerCase() === viewer) {
        const jId = String(m.jobId);
        const time = new Date(m.createdAt).getTime();
        if (!res[jId] || time > res[jId]) {
          res[jId] = time;
        }
      }
    }
    return res;
  }
};
