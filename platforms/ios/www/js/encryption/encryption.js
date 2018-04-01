var pidCrypt = require('./aes_ctr').pidCrypt;

var aes;
var pass;

function initializeEncryption (pw) {
  pass = pw;
  aes  = new pidCrypt.AES.CTR();
}

function encrypt(string) {
  if (aes) {
    aes.initEncrypt(string, pass, {nBits: 256});
    return JSON.stringify({"encrypted" : aes.encrypt()});
  } else {
    console.log("[ERROR] Encryption not initialized.");
    return "";
  }
}


function decrypt(encryptedPackage) {
  if (aes) {
    aes.initDecrypt(encryptedPackage.encrypted, pass, {nBits: 256});
    return aes.decrypt();
  } else {
    console.log("[ERROR] Encryption not initialized.");
    return "";
  }
}


module.exports.initializeEncryption = initializeEncryption;
module.exports.encrypt              = encrypt;
module.exports.decrypt              = decrypt;