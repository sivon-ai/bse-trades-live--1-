// Simulates "our network": any HTTP request still open after `seconds` is killed.
// Used by both servers so the 30-second rule is enforced, not just assumed.
module.exports = function netguard(seconds, label) {
  return (req, res, next) => {
    if (!seconds) return next();
    const timer = setTimeout(() => {
      console.warn(`[${label}] ${req.method} ${req.originalUrl} was open for more than ${seconds}s, connection killed`);
      req.socket.destroy();
    }, seconds * 1000);
    res.on('close', () => clearTimeout(timer));
    next();
  };
};
