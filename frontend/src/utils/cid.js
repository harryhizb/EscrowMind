const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(buffer) {
  let x = BigInt('0x' + Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join(''));
  let result = '';
  while (x > 0n) {
    const mod = x % 58n;
    result = BASE58_ALPHABET[Number(mod)] + result;
    x = x / 58n;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result;
  }
  return result;
}

export function decodeBase58(str) {
  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base58 character');
    result = result * 58n + BigInt(index);
  }
  let hex = result.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  return bytes;
}

export function cidToBytes32(cid) {
  if (!cid || typeof cid !== 'string' || !cid.startsWith('Qm')) return null;
  try {
    const decoded = decodeBase58(cid);
    const hex = Array.from(decoded).map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex.startsWith('1220') && hex.length === 68) {
      return '0x' + hex.slice(4);
    }
  } catch (e) {
    console.error('Failed to convert CID to bytes32:', e);
  }
  return null;
}

export function bytes32ToCid(bytes32Val) {
  if (!bytes32Val || typeof bytes32Val !== 'string' || bytes32Val === '0x0000000000000000000000000000000000000000000000000000000000000000') return '';
  try {
    const cleanHex = bytes32Val.startsWith('0x') ? bytes32Val.slice(2) : bytes32Val;
    if (cleanHex.length !== 64) return '';
    const hex = '1220' + cleanHex;
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return encodeBase58(bytes);
  } catch (e) {
    console.error('Failed to convert bytes32 to CID:', e);
    return '';
  }
}

export function parseOnChainNotes(notes, fallbackTitle) {
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && parsed.title) {
      return {
        title: parsed.title,
        description: parsed.description || '',
        notes: parsed.notes || ''
      };
    }
  } catch (e) {}
  return {
    title: fallbackTitle,
    description: notes || '',
    notes: notes || ''
  };
}
