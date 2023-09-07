var fs = require('fs')

const ErrorHandle = (err) => {
    const date = new Date().toISOString().
             replace(/T/, ' ').      // replace T with a space
             replace(/\..+/, '')     // delete the dot and everything after
    
    const data = '====================> '+ date + '\n'+ 
        "message => " + err.message + '\n' + 
        "errorType => " + err.name + '\n' + 
        "error => " + err + '\n' + '\n'
    fs.appendFile('log.txt', data, function (err) {
       if (err) throw err;
       console.log('Saved!');
    });
}

module.exports = ErrorHandle