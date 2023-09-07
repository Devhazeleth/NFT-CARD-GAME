/** @format */

const db = require("../models");
const Op = db.Sequelize.Op;
const User = db.users;
const Nft = db.nfts;
const Ownership = db.ownerships;
const Token = db.tokens;
const fs = require("fs");
const ErrorHandle = require("../utils/errorHandle");

const ethers = require("ethers");
const nftAbi = require("../abi/NftCardManager.json");
const { generateNonce, ErrorTypes, SiweMessage } = require("siwe");
const jwt = require("jsonwebtoken");
const {
  nftMint,
  nftTransfer,
  nftDeploy,
  createHistory,
  transactionHistory,
  nftChangeMetadata,
} = require("./nft.controller");

const JsonRpcProvider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL
);
const nftContract = new ethers.Contract(
  process.env.CARDCONTRACT_ADDRESS,
  nftAbi,
  JsonRpcProvider
);

global.cacheTransaction = [];

global.a = false;
// NFT contract event
// JsonRpcProvider.getBlockNumber().then(async latest_num => {
// 	transactionHistory({provider: JsonRpcProvider, contract: nftContract, latest_num})
// 	console.log("================")
// 	nftContract.on('ExposeBlocknumber', (operator, from, to, ids, amounts, data, block_num) => {
// 		console.log("-----------------")
// 		if(global.a) {
// 			createHistory({from, to, ids, amounts, block_num});
// 			if(from == '0x0000000000000000000000000000000000000000') {
// 				console.log("-----------------1")
// 				nftMint({to, ids, amounts})
// 			} else {
// 				console.log("-----------------2")
// 				nftTransfer({from, to, ids, amounts})
// 			}
// 		} else {
// 			console.log("-----------------3")
// 			const transaction = {
// 				from, to, ids, amounts, block_num
// 			}
// 			global.cacheTransaction.push(transaction);
// 		}
// 	})

// 	nftContract.on('AddMetadata', (tokenId, src, trait, strength, fileName, block_num) => {
// 		console.log("block_num => "+ block_num)
// 		nftDeploy({tokenId, src, trait, strength})
// 	})

// 	nftContract.on('ChangeMetadata', (tokenId, src, trait, strength, fileName, block_num) => {
// 		nftChangeMetadata({tokenId, src, trait, strength})
// 	})
// }).catch(err => ErrorHandle(err));

// user register
const register = async (account) => {
  const user = {
    user_name: account,
    wallet_address: account,
    img_url: "avatar.png",
    total_price: 0,
    win_count: 0,
    lose_count: 0,
  };

  if (!user.wallet_address) {
    res.status(400).send({
      message: "account can not be empty!",
    });
    return;
  }

  const created_user = await User.findOrCreate({
    where: { wallet_address: user.wallet_address },
    defaults: user,
  });

  return created_user[0];
};

// get user information
exports.findOne = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { wallet_address: req.body.account },
    });
    if (user) {
      const ranking = await User.count({
        where: {
          total_price: {
            [Op.gt]: user.total_price,
          },
        },
      });
      res.send({ user, ranking: ranking + 1 });
    } else {
      res.status(404).send({
        message: "Cannot find",
      });
    }
  } catch (err) {
    res.status(500).send({
      message: "Error retrieving User",
    });
  }
};

// save profile information
exports.saveProfile = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { wallet_address: req.body.walletaddress },
    });
    let avatar = req.files?.avatar;
    if (avatar) {
      const fileName = `${Date.now()}-${avatar.name}`;
      //Use the mv() method to place the file in the upload directory (i.e. "uploads")
      avatar.mv("./uploads/" + fileName);
      user.img_url = fileName;
    }
    user.user_name = req.body.username;
    const newUser = await user.save();
    res.status(200).json(newUser);
  } catch (err) {
    console.log(err);
    res.status(400).json("Something went wrong!");
  }
};

exports.getAllUser = async (req, res) => {
  try {
    const data = await User.findAll({
      attributes: {
        include: [
          [
            // Note the wrapping parentheses in the call below!
            db.sequelize.literal(`(
							SELECT COUNT(*)
							FROM users
							WHERE
								users.total_price > user.total_price
						)`),
            "ranking",
          ],
        ],
      },
    });
    if (data) {
      res.send(data);
    } else {
      res.status(404).send({
        message: "Cannot find",
      });
    }
  } catch (err) {
    res.status(404).send({
      message: "Error Find All",
    });
  }
};

exports.getAllNfts = async (req, res) => {
  try {
    const account = req.body.account;
    console.log(account);
    const nfts = await Ownership.findAll({
      where: { owner_address: account },
      include: [{ model: Token, as: "tokens" }],
    });
    res.status(200).json(nfts);
  } catch (err) {
    res.status(404).json({
      message: "Something went wrong.",
    });
  }
};

exports.getNonce = async (req, res) => {
  req.session.nonce = generateNonce();
  res.setHeader("Content-Type", "text/plain");
  res.status(200).send(req.session.nonce);
};

exports.verify = async (req, res) => {
  try {
    if (!req.body.message) {
      res
        .status(422)
        .json({ message: "Expected prepareMessage object as body." });
      return;
    }

    let message = new SiweMessage(req.body.message);
    const fields = await message.validate(req.body.signature);
    if (fields.nonce !== req.session.nonce) {
      res.status(422).json({
        message: `Invalid nonce.`,
      });
      return;
    }
    req.session.siwe = fields;
    req.session.cookie.expires = new Date(fields.expirationTime);
    const encode = jwt.sign(
      { account: fields.address },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const user = await register(fields.address);

    req.session.save(() =>
      res.status(200).json({
        nonce: req.session.nonce,
        token: encode,
        user: user,
      })
    );
  } catch (e) {
    req.session.siwe = null;
    req.session.nonce = null;
    console.error(e);
    switch (e) {
      case ErrorTypes.EXPIRED_MESSAGE: {
        req.session.save(() => res.status(440).json({ message: e.message }));
        break;
      }
      case ErrorTypes.INVALID_SIGNATURE: {
        req.session.save(() => res.status(422).json({ message: e.message }));
        break;
      }
      default: {
        req.session.save(() => res.status(500).json({ message: e.message }));
        break;
      }
    }
  }
};
