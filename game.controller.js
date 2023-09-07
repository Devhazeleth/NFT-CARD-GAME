const db = require("../models");
const User = db.users;
const Op = db.Sequelize.Op;
const { v4: uuidv4 } = require("uuid");
const { socketAuth } = require("./auth");
const { randomCards } = require("./nft.controller");
const { mutatedCharacter, recordGameResult } = require("./nft.controller");

const ethers = require("ethers");
const gameAbi = require("../abi/NftGameManager.json");

let rooms = [];
let users = [];
let roomno = 1;
let tempUsers = [];

const JsonRpcProvider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL
);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, JsonRpcProvider);
const gameContract = new ethers.Contract(
  process.env.GAMECONTRACT_ADDRESS,
  gameAbi,
  signer
);

module.exports = function (io) {
  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.auth.token;
      const res = await socketAuth(header, next);
      if (!res.status) {
        const err = new Error(res.message);
        next(err);
      } else {
        next();
      }
    } catch (err) {
      next(err);
    }
  });

  const contractPlayInfo = async (players) => {
    try {
      // players.forEach(async (player) => {
      //   console.log(player)
      //   const res = await gameContract.collectGameAssets(player.ids, player.bettedMoney, player.userAddress, {
      //     gasLimit: 100000000,
      //   })
      // })
    } catch (err) {
      console.log(err);
    }
  };

  const refundInfo = async (players) => {
    try {
      // players.forEach(async (player) => {
      //   const res = await gameContract.refundToUser(player.userAddress, player.isWinner, [], [], {
      //     gasLimit: 100000,
      //   })
      // })
    } catch (err) {
      console.log(err);
    }
  };

  const findUser = async (account) => {
    try {
      const user = await User.findOne({
        where: { wallet_address: account },
      });
      if (user) {
        const ranking = await User.count({
          where: {
            total_price: {
              [Op.gt]: user.total_price,
            },
          },
        });
        return { user, ranking };
      } else {
        return false;
      }
    } catch (err) {
      return false;
    }
  };

  const addUser = async (account, socketId, roomId, roomToken) => {
    const { user, ranking } = await findUser(account);

    let cards = await randomCards(account);
    if (!cards) {
      io.in(socketId).emit("notEnough", { message: "Cards is not enough!" });
      return false;
    }

    let allCards = [];
    cards.map((card) => {
      allCards.push({
        token_id: card.token_id,
        trait: card.trait,
        strength: card.strength,
        src: card.src,
        selected: false,
      });
    });
    const userInfo = {
      personInfo: user, // user info created the room
      ranking: ranking + 1,
      roomno: roomId, // room number created
      roomToken: roomToken,
      socketId: socketId, // userid of socket created
      gameInfo: {
        allCards: [...allCards], // all cards infomation
        threeCards: [null, null, null], // three cards info that customer choose
        mutatedCard: null,
        mintIds: [],
        burnIds: [],
        mutagen: null,
        isTurn: false, // is this your turn?
        isReady: false, // are you ready?
        isPass: false,
        ongoingStatus: 0, // total count of burned card
        burnCount: 0,
        winCount: 0, // win count in game room
      },
    };
    users.push(userInfo); // global variable
    return { user, ranking };
  };

  const checkBonus = (index) => {
    if (
      !users[index].gameInfo.threeCards[1] ||
      users[index].gameInfo.threeCards.length == 1
    ) {
      console.log("Can't calcuate the bonus value because of no person");
      return;
    }
    let num0 = 0;
    let num1 = users[index].gameInfo.threeCards[1].index;
    let num2 = 0;
    let condition1 = -1,
      condition2 = -1;

    if (users[index].gameInfo.allCards[num1].trait == 10) {
      if (users[index].gameInfo.threeCards[0]) {
        num0 = users[index].gameInfo.threeCards[0].index;
        users[index].gameInfo.threeCards[0].bonus =
          2 + (users[index].gameInfo.allCards[num0].trait % 3);
      }
      if (users[index].gameInfo.threeCards[2]) {
        num2 = users[index].gameInfo.threeCards[2].index;
        users[index].gameInfo.threeCards[2].bonus =
          2 + (users[index].gameInfo.allCards[num2].trait % 3);
      }
      return;
    }

    if (users[index].gameInfo.threeCards[0]) {
      num0 = users[index].gameInfo.threeCards[0].index;
      condition1 =
        (users[index].gameInfo.allCards[num0].trait -
          users[index].gameInfo.allCards[num1].trait) %
        3;
      if (condition1 == 0 && users[index].gameInfo.threeCards[0].bonus == 0) {
        users[index].gameInfo.threeCards[0].bonus +=
          1 + (users[index].gameInfo.allCards[num0].trait % 3);
      }
    }
    if (users[index].gameInfo.threeCards[2]) {
      num2 = users[index].gameInfo.threeCards[2].index;
      condition2 =
        (users[index].gameInfo.allCards[num2].trait -
          users[index].gameInfo.allCards[num1].trait) %
        3;
      if (condition2 == 0 && users[index].gameInfo.threeCards[2].bonus == 0) {
        users[index].gameInfo.threeCards[2].bonus +=
          1 + (users[index].gameInfo.allCards[num2].trait % 3);
      }
    }
    if (
      users[index].gameInfo.threeCards[0] &&
      users[index].gameInfo.threeCards[2]
    ) {
      if (condition1 == 0 && condition2 % 3 == 0) {
        // console.log(users[index].gameInfo.threeCards[0].bonus)
        users[index].gameInfo.threeCards[0].bonus += 1;
        users[index].gameInfo.threeCards[2].bonus += 1;
      }
    }
  };

  const checkMutagen = async (index) => {
    const roomId = users[index].roomno;
    const account = users[index].personInfo.wallet_address;
    let oppIndex = -1;
    let num0 = 0;
    let num1 = 0;
    let num2 = 0;
    for (let i = users.length - 1; i >= 0; i--) {
      if (
        users[i].roomno == roomId &&
        users[i].personInfo.wallet_address != account
      ) {
        oppIndex = i;
        break;
      }
    }
    if (
      users[index].gameInfo.threeCards.findIndex((card) => card == null) !=
        -1 ||
      users[oppIndex].gameInfo.threeCards.findIndex((card) => card == null) !=
        -1
    ) {
      console.log("Can't cause mutagen because of no cards.");
      return -1;
    }

    num0 = users[index].gameInfo.threeCards[0].index;
    num1 = users[index].gameInfo.threeCards[1].index;
    num2 = users[index].gameInfo.threeCards[2].index;
    users[index].gameInfo.threeCards[0].bonus =
      2 + (users[index].gameInfo.allCards[num0].trait % 3);
    users[index].gameInfo.threeCards[2].bonus =
      2 + (users[index].gameInfo.allCards[num2].trait % 3);
    users[index].gameInfo.isPass = true;
    users[index].gameInfo.burnIds.push(
      users[index].gameInfo.allCards[num1].token_id
    );
    let token_id = users[index].gameInfo.allCards[num1].token_id;
    let card = await mutatedCharacter(token_id);
    users[index].gameInfo.mutatedCard = card;
    num0 = users[oppIndex].gameInfo.threeCards[0].index;
    num1 = users[oppIndex].gameInfo.threeCards[1].index;
    num2 = users[oppIndex].gameInfo.threeCards[2].index;
    users[oppIndex].gameInfo.threeCards[0].bonus =
      2 + (users[oppIndex].gameInfo.allCards[num0].trait % 3);
    users[oppIndex].gameInfo.threeCards[2].bonus =
      2 + (users[oppIndex].gameInfo.allCards[num2].trait % 3);
    users[oppIndex].gameInfo.burnIds.push(
      users[oppIndex].gameInfo.allCards[num1].token_id
    );
    token_id = users[oppIndex].gameInfo.allCards[num1].token_id;
    card = await mutatedCharacter(token_id);
    users[oppIndex].gameInfo.mutatedCard = card;

    if (users[index].gameInfo.isPass && users[oppIndex].gameInfo.isPass) {
      return 1;
    } else {
      return -2;
    }
  };

  const nextGameStep = (account) => {
    // selecte the order of pleayers
    const num = users.findIndex(
      (user) => user.personInfo.wallet_address == account
    );
    users[num].gameInfo.isTurn = false;
    const roomId = users[num].roomno;
    const players = users.filter((user) => user.roomno == roomId); // get all players in roomId room
    if (players.length == 1) {
      console.log("You can not select any card because of no opposite player");
      return false;
    }
    let oppIndex = -1;
    for (let i = users.length - 1; i >= 0; i--) {
      if (
        users[i].roomno == roomId &&
        users[i].personInfo.wallet_address != account
      ) {
        oppIndex = i;
        break;
      }
    }
    users[oppIndex].gameInfo.isTurn = true;

    let mutagen = null;
    players.forEach((player) => {
      if (player.gameInfo.mutagen) {
        mutagen = player.gameInfo.mutagen;
      }
    });
    cardSelectTimer({
      players,
      account: users[oppIndex].personInfo.wallet_address,
    });
    return { num, roomId, players, mutagen };
  };

  const roundStart = (roomId, mutagen) => {
    const indexs = [];
    users.map((user, index) => {
      if (user.roomno == roomId) {
        indexs.push(index);
      }
    });
    const roomIndex = rooms.findIndex((room) => room.roomno == roomId);
    const player0 = users[indexs[0]].gameInfo.threeCards;
    const player1 = users[indexs[1]].gameInfo.threeCards;
    users[indexs[0]].gameInfo.isTurn = false;
    users[indexs[1]].gameInfo.isTurn = false;
    setTimeout(() => {
      let t_card1 = users[indexs[0]].gameInfo.allCards[player0[2].index];
      let t_card2 = users[indexs[1]].gameInfo.allCards[player1[0].index];
      if (
        t_card1.strength + player0[2].bonus >
        t_card2.strength + player1[0].bonus
      ) {
        if (users[indexs[0]].gameInfo.mutatedCard) {
          users[indexs[0]].gameInfo.mintIds.push(
            users[indexs[0]].gameInfo.mutatedCard.token_id
          );
        }
        users[indexs[1]].gameInfo.threeCards[0].burnStatus = true;
        users[indexs[1]].gameInfo.burnIds.push(t_card2.token_id);
        users[indexs[1]].gameInfo.burnCount += 1;
      }
      if (
        t_card1.strength + player0[2].bonus ==
        t_card2.strength + player1[0].bonus
      ) {
        if (users[indexs[0]].gameInfo.mutatedCard) {
          users[indexs[0]].gameInfo.mintIds.push(
            users[indexs[0]].gameInfo.mutatedCard.token_id
          );
        }
        users[indexs[0]].gameInfo.threeCards[2].burnStatus = true;
        users[indexs[0]].gameInfo.burnIds.push(t_card1.token_id);
        users[indexs[0]].gameInfo.burnCount += 1;
        users[indexs[1]].gameInfo.threeCards[0].burnStatus = true;
        users[indexs[1]].gameInfo.burnIds.push(t_card2.token_id);
        users[indexs[1]].gameInfo.burnCount += 1;
      }
      if (
        t_card1.strength + player0[2].bonus <
        t_card2.strength + player1[0].bonus
      ) {
        users[indexs[0]].gameInfo.threeCards[2].burnStatus = true;
        users[indexs[0]].gameInfo.burnIds.push(t_card1.token_id);
        users[indexs[0]].gameInfo.burnCount += 1;
      }

      if (
        t_card1.strength + player0[2].bonus <
        t_card2.strength + player1[0].bonus
      ) {
        if (!users[indexs[0]].gameInfo.mutatedCard) {
          users[indexs[0]].gameInfo.burnIds.push(
            users[indexs[0]].gameInfo.allCards[player0[1].index].token_id
          );
        }
        users[indexs[0]].gameInfo.threeCards[1].burnStatus = true;
        users[indexs[0]].gameInfo.burnCount += 1;
      }
      rooms[roomIndex].currentOption = 3;
      io.in(users[indexs[0]].socketId).emit("playerInfo", {
        players: [users[indexs[0]], users[indexs[1]]],
        mutagen,
        option: 3,
      }); // broadcast players list to players of roomId room
      io.in(users[indexs[1]].socketId).emit("playerInfo", {
        players: [users[indexs[0]], users[indexs[1]]],
        mutagen,
        option: 4,
      }); // broadcast players list to players of roomId room
    }, 2000);

    setTimeout(() => {
      let t_card1 = users[indexs[0]].gameInfo.allCards[player0[0].index];
      let t_card2 = users[indexs[1]].gameInfo.allCards[player1[2].index];
      if (
        t_card1.strength + player0[0].bonus >
        t_card2.strength + player1[2].bonus
      ) {
        users[indexs[1]].gameInfo.threeCards[2].burnStatus = true;
        users[indexs[1]].gameInfo.burnIds.push(t_card2.token_id);
        users[indexs[1]].gameInfo.burnCount += 1;
      }
      if (
        t_card1.strength + player0[0].bonus ==
        t_card2.strength + player1[2].bonus
      ) {
        if (users[indexs[1]].gameInfo.mutatedCard) {
          users[indexs[1]].gameInfo.mintIds.push(
            users[indexs[1]].gameInfo.mutatedCard.token_id
          );
        }
        users[indexs[0]].gameInfo.threeCards[0].burnStatus = true;
        users[indexs[0]].gameInfo.burnIds.push(t_card1.token_id);
        users[indexs[0]].gameInfo.burnCount += 1;
        users[indexs[1]].gameInfo.threeCards[2].burnStatus = true;
        users[indexs[1]].gameInfo.burnIds.push(t_card2.token_id);
        users[indexs[1]].gameInfo.burnCount += 1;
      }
      if (
        t_card1.strength + player0[0].bonus <
        t_card2.strength + player1[2].bonus
      ) {
        if (users[indexs[1]].gameInfo.mutatedCard) {
          users[indexs[1]].gameInfo.mintIds.push(
            users[indexs[1]].gameInfo.mutatedCard.token_id
          );
        }
        users[indexs[0]].gameInfo.threeCards[0].burnStatus = true;
        users[indexs[0]].gameInfo.burnIds.push(
          users[indexs[0]].gameInfo.allCards[player0[0].index].token_id
        );
        users[indexs[0]].gameInfo.burnCount += 1;
      }

      const flag =
        t_card1.strength + player0[0].bonus >
          t_card2.strength + player1[2].bonus &&
        !users[indexs[1]].gameInfo.threeCards[1].burnStatus
          ? true
          : false;
      if (flag) {
        if (!users[indexs[1]].gameInfo.mutatedCard) {
          users[indexs[1]].gameInfo.burnIds.push(
            users[indexs[1]].gameInfo.allCards[player1[1].index].token_id
          );
        }
        users[indexs[1]].gameInfo.threeCards[1].burnStatus = true;
        users[indexs[1]].gameInfo.burnCount += 1;
      }
      rooms[roomIndex].currentOption = 5;
      io.in(users[indexs[0]].socketId).emit("playerInfo", {
        players: [users[indexs[0]], users[indexs[1]]],
        mutagen,
        option: 5,
      }); // broadcast players list to players of roomId room
      io.in(users[indexs[1]].socketId).emit("playerInfo", {
        players: [users[indexs[0]], users[indexs[1]]],
        mutagen,
        option: 6,
      }); // broadcast players list to players of roomId room
    }, 8000);

    setTimeout(() => {
      roundCalc(roomId, indexs, mutagen);
      users[indexs[0]].gameInfo.isTurn = true;
    }, 14000);
    rooms[roomIndex].currentOption = 13;
    io.sockets.in("room-" + roomId).emit("roundStart", { option: 13 }); // broadcast players list to players of roomId room
    console.log("Round is started");
  };

  const roundCalc = (roomId, indexs, mutagen) => {
    const roomIndex = rooms.findIndex((room) => room.roomno == roomId);
    users[indexs[0]].gameInfo.ongoingStatus +=
      users[indexs[0]].gameInfo.burnCount;
    users[indexs[1]].gameInfo.ongoingStatus +=
      users[indexs[1]].gameInfo.burnCount;
    if (
      users[indexs[0]].gameInfo.burnCount > users[indexs[1]].gameInfo.burnCount
    ) {
      users[indexs[0]].gameInfo.winCount += 1;
    }
    if (
      users[indexs[0]].gameInfo.burnCount < users[indexs[1]].gameInfo.burnCount
    ) {
      users[indexs[1]].gameInfo.winCount += 1;
    }
    rooms[roomIndex].currentOption = 9;
    io.sockets.in("room-" + roomId).emit("playerInfo", {
      players: [users[indexs[0]], users[indexs[1]]],
      mutagen,
      option: 9, // ------ one round result
    }); // broadcast players list to players of roomId room
    setTimeout(() => {
      rooms[roomIndex].currentOption = 12;
      io.sockets.in("room-" + roomId).emit("cardAnimation", { option: 12 }); // --- rest animation clear
    }, 3000);
    setTimeout(async () => {
      indexs.forEach((id) => {
        users[id].gameInfo.burnCount = 0;
        users[id].gameInfo.threeCards = [null, null, null];
        users[id].gameInfo.mutagen = null;
        users[id].gameInfo.isPass = false;
      });

      if (rooms[roomIndex].round == 2) {
        rooms[roomIndex].currentOption = 11;
        io.sockets.in("room-" + roomId).emit("playerInfo", {
          players: [users[indexs[0]], users[indexs[1]]],
          mutagen: null,
          option: 11, // ---- game result that play the 3 times.
        }); // broadcast players list to players of roomId room
        recordGameResult(
          [users[indexs[0]], users[indexs[1]]],
          rooms[roomIndex].amount
        );

        let isWinner =
          users[indexs[0]].gameInfo.ongoingStatus >
          users[indexs[1]].gameInfo.ongoingStatus
            ? true
            : false;
        const playersInfo = [
          {
            userAddress: users[indexs[0]].personInfo.wallet_address,
            isWinner: !isWinner,
            burnIds: users[indexs[0]].gameInfo.burnIds,
            mintIds: users[indexs[0]].gameInfo.mintIds,
          },
          {
            userAddress: users[indexs[1]].personInfo.wallet_address,
            isWinner: isWinner,
            burnIds: users[indexs[1]].gameInfo.burnIds,
            mintIds: users[indexs[1]].gameInfo.mintIds,
          },
        ];
        try {
          await refundInfo(playersInfo);
          console.log(playersInfo);
          console.log(tempUsers);

          io.sockets
            .in("room-" + roomId)
            .emit("gameFinished", "Game is finsished"); // broadcast to players that game is finished
          io.in("room-" + roomId).socketsLeave("room-" + roomId);
          const t_room1 = tempUsers.findIndex(
            (account) => account == users[indexs[0]].personInfo.wallet_address
          );
          const t_room2 = tempUsers.findIndex(
            (account) => account == users[indexs[1]].personInfo.wallet_address
          );
          console.log(t_room1);
          console.log(t_room2);
          tempUsers.splice(t_room1, 1);
          tempUsers.splice(t_room2 - 1, 1);
          rooms.splice(roomIndex, 1); // remove room
          users.splice(indexs[0], 1); // remove player1
          users.splice(indexs[1] - 1, 1); // remove player2
          console.log("Game is finished.");
          console.log(tempUsers);
          console.log(rooms);
          console.log(users);
        } catch (err) {
          console.log(err);
        }
        return;
      }
      cardSelectTimer({
        players: [users[indexs[0]], users[indexs[1]]],
        account: users[indexs[0]].personInfo.wallet_address,
      });
      rooms[roomIndex].round += 1;
      rooms[roomIndex].currentOption = 10;
      users[indexs[0]].gameInfo.mutagen = null;
      users[indexs[0]].gameInfo.mutatedCard = null;
      users[indexs[1]].gameInfo.mutagen = null;
      users[indexs[1]].gameInfo.mutatedCard = null;
      io.sockets.in("room-" + roomId).emit("playerInfo", {
        players: [users[indexs[0]], users[indexs[1]]],
        mutagen: null,
        option: 10, // ------- set the initial value
      }); // broadcast players list to players of roomId room
    }, 7000);
  };

  const cardSelectTimer = ({ players, account }) => {
    const player = users.filter(
      (user) => user.personInfo.wallet_address == account
    );
    const roomId = player[0].roomno;
    let flag = false;
    let num = 9;
    let si = setInterval(() => {
      if (player[0].gameInfo.isTurn == false) {
        clearInterval(si);
        flag = true;
        return;
      }
      const res = players.map((player) => {
        let temp = {
          account: player.personInfo.wallet_address,
          isTurn: player.gameInfo.isTurn,
          time: -1,
        };
        if (temp.account == account) {
          temp.time = num;
        }
        return temp;
      });
      io.sockets.in("room-" + roomId).emit("playTimeout", res);
      num--;
      // console.log('Timer Event = '+ num)
    }, 1000);
    setTimeout(async () => {
      clearInterval(si);
      if (!flag) {
        await randomCardSelect(account);
        console.log("Random card select.");
      }
      console.log("Timer Event is closed.");
    }, 11000);
  };

  const randomCardSelect = async (account) => {
    const userIndex = users.findIndex(
      (user) => user.personInfo.wallet_address == account
    );
    if (!users[userIndex].gameInfo.isTurn) {
      return;
    }
    console.log("qqwqwe");
    const flag = users[userIndex].gameInfo.threeCards.findIndex(
      (card) => card == null
    );
    if (flag == -1) {
      pass(account);
      console.log("pass");
      return;
    }
    let num = 0;
    console.log(
      "card select 1 ================================================================"
    );
    while (1) {
      num = Math.floor(Math.random() * 18);
      // console.log(num)
      const card = users[userIndex].gameInfo.allCards[num];
      if (card.selected || card.trait == 9) {
        continue;
      }
      if (card.trait == 10 || Math.floor(card.trait / 3) == 0) {
        if (users[userIndex].gameInfo.threeCards[1]) continue;
      }
      if (Math.floor(card.trait / 3) == 1) {
        if (users[userIndex].gameInfo.threeCards[0]) continue;
      }
      if (Math.floor(card.trait / 3) == 2) {
        if (users[userIndex].gameInfo.threeCards[2]) continue;
      }
      break;
    }
    console.log(
      "card select 2 ================================================================"
    );
    await cardSelect({ index: num, account });
    console.log("card select...");
  };

  const pass = (account) => {
    const { num, roomId, players, mutagen } = nextGameStep(account);
    const roomIndex = rooms.findIndex((room) => room.roomno == roomId);
    if (!players) return;
    users[num].gameInfo.isPass = true;
    if (players[0].gameInfo.isPass && players[1].gameInfo.isPass) {
      roundStart(roomId, mutagen);
    }
    rooms[roomIndex].currentOption = 8;
    io.sockets
      .in("room-" + roomId)
      .emit("playerInfo", { players, mutagen, option: 8 }); // broadcast players list to players of roomId room
  };

  const cardSelect = async ({ account, index }) => {
    console.log(
      "card select 3 ================================================================"
    );
    let { num, roomId, players, mutagen } = nextGameStep(account);
    const roomIndex = rooms.findIndex((room) => room.roomno == roomId);
    if (!players) return; // no opposite player
    users[num].gameInfo.allCards[index].selected = true;
    const card = users[num].gameInfo.allCards[index];
    let cardIndex = -1;
    if (card.trait == 9) {
      if (mutagen) return;

      ////////////////////////////////
      //             //             //
      ////////////////////////////////

      const flag = await checkMutagen(num); // check out the bonus value.
      if (flag == 1) {
        users[num].gameInfo.burnIds.push(
          users[num].gameInfo.allCards[index].token_id
        );
        users[num].gameInfo.mutagen = users[num].gameInfo.allCards[index].src;
        mutagen = users[num].gameInfo.allCards[index].src;
        roundStart(roomId, mutagen);
      } else {
        if (flag == -1) {
          return;
        } else {
          users[num].gameInfo.burnIds.push(
            users[num].gameInfo.allCards[index].token_id
          );
          users[num].gameInfo.mutagen = users[num].gameInfo.allCards[index].src;
          mutagen = users[num].gameInfo.allCards[index].src;
        }
      }
    } else {
      const oneCard = {
        index: index,
        burnStatus: false,
        bonus: 0,
      };
      if (card.trait == 10 || Math.floor(card.trait / 3) == 0) {
        if (users[num].gameInfo.threeCards[1]) return;
        users[num].gameInfo.threeCards[1] = oneCard;
        cardIndex = 1;
      }
      if (Math.floor(card.trait / 3) == 1) {
        if (users[num].gameInfo.threeCards[0]) return;
        users[num].gameInfo.threeCards[0] = oneCard;
        cardIndex = 0;
      }
      if (Math.floor(card.trait / 3) == 2) {
        if (users[num].gameInfo.threeCards[2]) return;
        users[num].gameInfo.threeCards[2] = oneCard;
        cardIndex = 2;
      }
      checkBonus(num); // check out the bonus value.
    }
    let t_players = users.filter((user) => user.roomno == roomId);

    const flag1 = t_players[0].gameInfo.threeCards.findIndex(
      (card) => card == null
    );
    const flag2 = t_players[1].gameInfo.threeCards.findIndex(
      (card) => card == null
    );
    if (flag1 == -1 && flag2 == -1 && card.trait != 9) {
      rooms[roomIndex].currentOption = 14;
      io.sockets.in("room-" + roomId).emit("passActive", { option: 14 });
    }
    rooms[roomIndex].currentOption = 7;
    io.sockets.in("room-" + roomId).emit("cardSelected", {
      players: t_players,
      mutagen,
      option: 7,
      cardIndex,
      owner: users[num].personInfo.wallet_address,
    }); // broadcast players list to players of roomId room
  };

  const initialProps = ({ players }) => {
    let passActive = false;
    let currentOption = -1;
    const flag1 = players[0].gameInfo.threeCards.findIndex(
      (card) => card == null
    );
    const flag2 = players[1].gameInfo.threeCards.findIndex(
      (card) => card == null
    );
    if (flag1 == -1 && flag2 == -1) {
      passActive = true;
    }
    const room = rooms.find((room) => room.roomno == players[0].roomno);
    currentOption = room.currentOption;
    return { passActive, currentOption };
  };

  io.on("connection", (socket) => {
    console.log("A User connected");

    socket.on("createRoom", async ({ account, amount }) => {
      const roomToken = uuidv4();
      const index = users.findIndex(
        (user) => user.personInfo.wallet_address === account
      );
      if (index != -1) {
        socket.emit("enteredRoom", users[index].roomToken);
        console.log("User exist");
        return;
      }

      const { user, ranking } = await addUser(
        account,
        socket.id,
        roomno,
        roomToken
      );
      if (!user) {
        return;
      }
      const room = { roomno, amount, round: 0, roomToken, currentOption: -1 };
      rooms.push(room); //global variable
      socket.emit("enteredRoom", roomToken);
      roomno++;

      socket.broadcast.emit("newRoom", {
        room: {
          personInfo: user,
          roomno: room.roomno,
          roomToken: room.roomToken,
          amount: room.amount,
          ranking: ranking + 1,
        },
      });
      console.log(`A new room-${roomno} is created`);
    });

    socket.on("joinRoom", async ({ account, roomToken }) => {
      const room = rooms.find((room) => room.roomToken == roomToken);
      if (!room) {
        console.log(`There isn't room-${"roomId"} room!!!`);
        return;
      }
      const index = users.findIndex(
        (user) => user.personInfo.wallet_address == account
      );

      if (index != -1) {
        socket.emit("enteredRoom", users[index].roomToken);
        console.log("User exist");
        return;
      }
      const { user } = await addUser(
        account,
        socket.id,
        room.roomno,
        roomToken
      );
      if (!user) {
        return;
      }
      socket.emit("enteredRoom", roomToken);
      console.log(`${account} is Joined in room-${"roomId"}`);
    });

    socket.on("updateRoom", (account) => {
      const person = users.find(
        (user) => user.personInfo.wallet_address == account
      );
      if (person) {
        if (tempUsers.findIndex((user) => user == account) != -1) {
          tempUsers.push(account);
        }
        const roomId = person.roomno;
        socket.join("room-" + roomId);
        const roomIndex = rooms.findIndex((room) => room.roomno == roomId);

        person.socketId = socket.id;
        const players = users.filter((user) => user.roomno == roomId); // get all players in roomId room
        const mutagen = players.filter((player) => player.gameInfo.mutagen);
        if (
          players.length == 2 &&
          players[0].gameInfo.isReady &&
          players[1].gameInfo.isReady
        ) {
          // game continue
          const props = initialProps({ players });
          io.in(socket.id).emit("initialInfo", {
            players,
            mutagen: mutagen.length ? mutagen[0].gameInfo.mutagen : 0,
            props: props,
            option: 15, // ------- continuously enter the room.
          }); // broadcast players list to players of roomId room
          return;
        }
        if (io.sockets.adapter.rooms.get("room-" + roomId).size == 1) {
          // only one who create the room
          rooms[roomIndex].currentOption = 1;
          io.sockets.in("room-" + roomId).emit("playerInfo", {
            players,
            mutagen: null,
            option: 1, // ------- enter the room.
          }); // broadcast players list to players of roomId room
          return;
        }
        if (io.sockets.adapter.rooms.get("room-" + roomId).size == 2) {
          // two members entered the room
          rooms[roomIndex].currentOption = 1;
          io.sockets.in("room-" + roomId).emit("playerInfo", {
            players,
            mutagen: null,
            option: 1, // ------- enter the room.
          }); // broadcast players list to players of roomId room
          const indexs = [];
          users.map((user, index) => {
            if (user.roomno == roomId) {
              indexs.push(index);
            }
          });
          const playersInfo = [
            {
              ids: users[indexs[0]].gameInfo.allCards.map(
                (card) => card.token_id
              ),
              bettedMoney: rooms[roomIndex].amount,
              userAddress: users[indexs[0]].personInfo.wallet_address,
            },
            {
              ids: users[indexs[1]].gameInfo.allCards.map(
                (card) => card.token_id
              ),
              bettedMoney: rooms[roomIndex].amount,
              userAddress: users[indexs[1]].personInfo.wallet_address,
            },
          ];
          setTimeout(() => {
            io.sockets.in("room-" + roomId).emit("gameStartCounter", "3");
          }, 1000);
          setTimeout(() => {
            io.sockets.in("room-" + roomId).emit("gameStartCounter", "2");
          }, 2000);
          setTimeout(() => {
            io.sockets.in("room-" + roomId).emit("gameStartCounter", "1");
          }, 3000);
          setTimeout(async () => {
            users[indexs[0]].gameInfo.isReady = true;
            users[indexs[1]].gameInfo.isReady = true;
            rooms[roomIndex].currentOption = 2;
            io.sockets.in("room-" + roomId).emit("playerInfo", {
              players: [users[indexs[0]], users[indexs[1]]],
              mutagen: null,
              option: 2, // -------- game start
            }); // broadcast players list to players of roomId room
            try {
              await contractPlayInfo(playersInfo);
              setTimeout(() => {
                cardSelectTimer({
                  players: [users[indexs[0]], users[indexs[1]]],
                  account: users[indexs[0]].personInfo.wallet_address,
                }); // cause timeout event while you select any card.
                users[indexs[0]].gameInfo.isTurn = true;
                io.sockets.in("room-" + roomId).emit("playerInfo", {
                  players: [users[indexs[0]], users[indexs[1]]],
                  mutagen: null,
                  option: 2, // -------- game start
                }); // broadcast players list to players of roomId room
              }, 2000);
            } catch (err) {
              console.log(err);
            }
          }, 4000);
        }
        return;
      }
      console.log("verify ====================================");
      console.log(users);
      console.log(tempUsers);
      console.log(rooms);
      socket.emit("userVerify", { msg: "The game room is closed!" });
    });

    socket.on("getRooms", (account) => {
      let allRoomsInfo = [];
      users.forEach((user) => {
        const { roomno: roomId, personInfo, ranking } = user;

        if (user.personInfo.wallet_address != account) {
          const room = rooms.find((room) => room.roomno === roomId);
          const roomCount = users.filter(
            (user) => user.roomno == roomId
          ).length;
          if (room && roomCount == 1) {
            const res = {
              personInfo,
              roomno: room.roomno,
              roomToken: room.roomToken,
              amount: room.amount,
              ranking,
            };
            allRoomsInfo.push(res);
          }
        }
      });
      socket.emit("allRooms", allRoomsInfo);
      console.log("Get All room infos");
    });

    socket.on("selectedCard", async ({ index, account }) => {
      await cardSelect({ account, index });
      console.log("A card selected");
    });

    socket.on("ready", ({ account }) => {
      const num = users.findIndex(
        (user) => user.personInfo.wallet_address == account
      );
      const roomId = users[num].roomno;
      const players = users.filter((user) => user.roomno == roomId); // get all players in roomId room
      if (players.length == 1) {
        console.log(
          "Opposite player is not joined your room yet! please a wait."
        );
        return;
      }
      users[num].gameInfo.isReady = true;
      if (players[0].gameInfo.isReady && players[1].gameInfo.isReady) {
        const index = users.findIndex(
          (user) => user.socketId == players[0].socketId
        );
        users[index].gameInfo.isTurn = true;
        players[0].gameInfo.isTurn = true;
      }
      io.sockets
        .in("room-" + roomId)
        .emit("playerInfo", { players, mutagen: null }); // broadcast players list to players of roomId room
    });

    socket.on("pass", ({ account }) => {
      pass(account);
      console.log("a user clicked the pass button");
    });

    socket.on("disconnect", function () {
      const index = users.findIndex((user) => user.socketId == socket.id);
      if (index == -1) return;
      const roomId = users[index].roomno;
      const account = users[index].personInfo.wallet_address;
      const t_index = tempUsers.findIndex((user) => user == account);
      const t_users = users.filter((user) => user.roomno == roomId);
      const roomIndex = rooms.findIndex((room) => room.roomno == roomId);
      if (t_users.length == 2) {
        socket.broadcast.emit("deleteRoom", { roomno: roomId });
        return;
      }
      if (t_index == -1) {
        return;
      }

      if (t_users.length == 1) {
        users.splice(index, 1);
        rooms.splice(roomIndex, 1);
        tempUsers.splice(t_index, 1);
      }

      socket.broadcast.emit("deleteRoom", { roomno: roomId });
      console.log("A user disconnected");
    });
  });
};
