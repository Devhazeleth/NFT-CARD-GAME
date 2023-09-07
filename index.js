/** @format */

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const PORT = process.env.PORT || 8080;
const Session = require("express-session");
const cors = require("cors");
const morgan = require("morgan");
const fileUpload = require("express-fileupload");
const _ = require("lodash");
require("dotenv").config();

const db = require("./app/models");
const socketControler = require("./app/controllers/socket.controller");
const user = require("./app/routes/user.routes.js");
const http = require("http").Server(app);
const {
  nftMint,
  nftTransfer,
  mutatedCharacter,
} = require("./app/controllers/nft.controller");
const { randomCards } = require("./app/controllers/nft.controller");

// cors middleware
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/uploads", express.static("./uploads"));

// enable files upload
app.use(
  fileUpload({
    createParentPath: true,
  })
);

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(
  Session({
    name: "siwe-quickstart",
    secret: "siwe-quickstart-secret",
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false, sameSite: true },
  })
);

// user Router
app.use("/api/user", user);

app.post("/test2", async (req, res) => {
  let card = await mutatedCharacter(40);
  // const cards = await randomCards('0xfF7a42c0a273ABA6EFAda657c609BAD2063611F5');
  res.status(200).json(card);
});

// define socket part
socketControler(io);

// migrate the users table in gamedb Database

db.sequelize
  .sync()
  .then(() => {
    console.log("ok");
  })
  .catch((err) => {
    console.log("Failed");
  });

http.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});
