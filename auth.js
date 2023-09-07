const jwt =  require('jsonwebtoken');
const { token } = require('morgan');
const { promisify } = require("util");

const AppError = require('../utils/appErrors')

const db = require('../models');
const User = db.users;

exports.authenticate = async (req, res, next) => {
    try {
        // 1) check if the token is there
        let token;
        if (
          req.headers.authorization &&
          req.headers.authorization.startsWith("bearer")
        ) {
          token = req.headers.authorization.split(" ")[1];
        }
        if (!token) {
          return next(
            new AppError(
              401,
              "fail",
              "You are not logged in! Please login in to continue",
            ),
            req,
            res,
            next,
          );
        }
    
        // 2) Verify token
        const decode = await promisify(jwt.verify)(token, process.env.SECRET_KEY);
    
        // 3) check if the user is exist (not deleted)
        const user = await User.findOne({
			where: { wallet_address: decode.account}
		});
        if (!user) {
          return next(
            new AppError(401, "fail", "This user is no longer exist"),
            req,
            res,
            next,
          );
        }
    
        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
};

exports.socketAuth = async(header, next) => {
  try {
    // 1) check if the token is there
    let token;
    if (
      header &&
      header.startsWith("bearer")
    ) {
      token = header.split(" ")[1];
    }
    if (!token) {
      return {
        status: false,
        message: "You are not logged in! Please login in to continue"
      }
    }

    // 2) Verify token
    const decode = await promisify(jwt.verify)(token, process.env.SECRET_KEY);

    // 3) check if the user is exist (not deleted)
    const user = await User.findOne({
      where: { wallet_address: decode.account}
    });
    if (!user) {
      return {
        status: false,
        message: "This user is no longer exist"
      }
    }

    return {
      status: true,
      message: "success"
    }
  } catch (err) {
    return {
      status: false,
      message: err
    }
  }
}
