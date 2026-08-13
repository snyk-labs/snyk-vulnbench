const path = require('node:path');

exports.download = (res, requestedFile, next) => {
  const filePath = path.join(__dirname, '..', 'public', 'documents', requestedFile);

  res.download(filePath, (error) => {
    if (error && !res.headersSent) next(error);
  });
};
