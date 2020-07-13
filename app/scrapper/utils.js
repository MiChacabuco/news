exports.asciiToChar = (text) => {
  const codes = [8211, 8220, 8221];
  codes.forEach((code) => {
    text = text.replace(`&#${code};`, String.fromCharCode(code));
  });
};
