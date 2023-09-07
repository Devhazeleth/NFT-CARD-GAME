/** @format */

const multer = require('multer');
const fs = require('fs');

// const excelFilter = (req, file, cb) => {
//   if (
//     file.mimetype.includes('excel') ||
//     file.mimetype.includes('spreadsheetml')
//   ) {
//     cb(null, true)
//   } else {
//     cb("Please upload only excel file.", false)
//   }
// }

var storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const path = __dirname + '../../../../frontend/public';
		console.log(path);
		fs.access(path, (error) => {
			if (error) {
				fs.mkdirSync(path, { recursive: true });
			}
			cb(null, path);
		});
	},
	filename: (req, file, cb) => {
		cb(null, `${Date.now()}-${file.originalname}`);
	},
});

const uploadfile = multer({
	storage: storage,
	// fileFilter: excelFilter
});

module.exports = uploadfile;
