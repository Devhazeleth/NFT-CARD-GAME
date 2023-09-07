const ErrorHandle = require('../utils/errorHandle')
const db = require('../models');
const fs = require('fs');
const { shuffle } = require('lodash');
const Op = db.Sequelize.Op;
const User = db.users;
const Ownership = db.ownerships
const Token = db.tokens
const History = db.histories
const sequelize = db.sequelize

const mint = async ({to, ids, amounts}) => { // mint and burn
    try {
        for(let i=0; i<ids.length; i++) {
            const token = await Token.findOne({
                where: {
                    token_id: ids[i]
                }
            });
            
            if(token) {
                const user = await Ownership.findOne({
                    where: {
                        owner_address: to,
                        token_id: token.id
                    }
                })

                if(user) {
                    if(amounts[i] < 0 && user.amount*1 + amounts[i]*1 == 0) {
                        await user.destroy();
                    } else {
                        await user.update({
                            amount: user.amount*1 + amounts[i]*1
                        })
                        await user.save()
                        console.log('update token success')
                    }
                } else {
                    const user_token = {
                        owner_address: to,
                        token_id: token.id,
                        amount: amounts[i]*1,
                    }
                    await Ownership.create(user_token)
                    console.log('create token success')
                }
            }
        }
    } catch (err) {
        ErrorHandle(err)
    }
}

const transfer = async ({from, to, ids, amounts}) => { // nft transfer
    try {
        for(let i=0;i<ids.length; i++) {
            const token = await Token.findOne({
                where: {
                    token_id: ids[i]
                }
            })
            if(token) {
                const user = await Ownership.findOne({
                    where: {
                        owner_address: from,
                        token_id: token.id
                    }
                })
                if(user) {
                    if(user.amount*1 - amounts[i]*1 > 0) {
                        await user.update({
                            amount: user.amount*1 - amounts[i]*1
                        })
                        await user.save()
                        await mint({to, ids:[ids[i]], amount:[amounts[i]]})
                    }
                    if(user.amount*1 - amounts[i]*1 == 0) {
                        await user.destroy();
                    }
                }
            }
        }
    } catch(err) {
        ErrorHandle(err)
    }
}

const deploy = async ({tokenId, src, trait, strength}) => {
    try {
        const token = {
            token_id: tokenId,
            trait,
            strength,
            src
        }
        await Token.create(token)
        console.log("deploy success")
    } catch(err) {
        ErrorHandle(err)
    }
}

const historyTranscation = ({from, to, ids, amounts, block_num}) => {
    console.log("============================================================")
    for(let i=0; i<ids.length; i++) {
        const history = {
            from,
            to,
            token_id: ids[i],
            amount: amounts[i],
            block_num
        }
        History.create(history)
            .then((history) => console.log('history create success'))
            .catch(err => ErrorHandle(err))
    }
}

exports.mutatedCharacter = async (token_id) => {
    const card = await Token.findOne({
        where: {
            token_id: token_id+1
        }
    })
    return card
}

exports.createHistory = ({from, to, ids, amounts, block_num}) => {
    historyTranscation({from, to, ids, amounts, block_num})
}

exports.nftMint = async ({to, ids, amounts}) => {
    await mint({to, ids, amounts})
}

exports.nftTransfer = async ({from, to, ids, amounts}) => {
    await transfer({from, to, ids, amounts})
}

exports.nftDeploy = ({tokenId, src, trait, strength}) => {
    deploy({tokenId, src, trait, strength})   
}

exports.nftChangeMetadata = async ({tokenId, src, trait, strength}) => {
    try {
        const token = await Token.findOne({
            where: {
                token_id: tokenId
            }
        });
        await token.update({
            src: src,
            trait: trait,
            strength: strength
        })
        await token.save();
        console.log("change metadata success")
    } catch(err) {
        ErrorHandle(err)
    }
}

exports.transactionHistory = async ({provider, contract, latest_num}) => {
    const history = await History.findOne({
        order: [['block_num', 'DESC']],
    })
    if(history) {
        // let fromBlock = history.block_num;
        let fromBlock = 25871360;
        let latest_num = 25871361;
        await reverseBlock(fromBlock)
        const page = Math.floor((latest_num*1 - fromBlock*1) / 256);
        for(let i=0; i<=page; i++) {
            let filter = contract.filters.ExposeBlocknumber()
            filter.fromBlock = fromBlock;
            filter.toBlock = fromBlock + 255 > latest_num? latest_num: fromBlock + 255;
            const logs = await provider.getLogs(filter)
            for(let log of logs) {
                const data = contract.interface.parseLog(log)
                historyTranscation({
                    from:data.args.from, 
                    to: data.args.to, ids: data.args.ids, 
                    amounts: data.args.amounts, block_num: data.args.blocknumber});
                if(data.args['from'] == '0x0000000000000000000000000000000000000000') {
                    await mint({
                        to: data.args.to,
                        ids: data.args.ids,
                        amounts: data.args.amounts
                    })
                } else {
                    await transfer({
                        from: data.args.from,
                        to: data.args.to,
                        ids: data.args.ids,
                        amounts: data.args.amounts
                    })
                }
                // fs.appendFileSync('addressesBNB.csv', data.args +'\n')
            }
            fromBlock = fromBlock + 256
        }
    }
    global.a = true
    await cacheTransaction(global.cacheTransaction)
}

const reverseBlock = async (block_num) => {
    const histories = await History.findAll({
        where: {
            block_num: block_num
        }
    })
    for(let history of histories) {
        if(history.from == '0x0000000000000000000000000000000000000000') {
            await mint({
                to: history.to,
                ids: [history.token_id],
                amounts: [history.amount*(-1)]
            })
        } else {
            await transfer({
                to: history.from,
                from: history.to,
                ids: [history.token_id],
                amounts: [history.amount]
            })
        }
        await history.destroy();
    }
}

const cacheTransaction = async (transactions) => {
    for(let transaction of transactions) {
        historyTranscation({
            from: history.from,
            to: history.to,
            ids: history.ids,
            amounts: history.amounts,
            block_num: history.block_num   
        })
        if(transaction.from == '0x0000000000000000000000000000000000000000') {
            await mint({
                to: transaction.to,
                ids: transaction.ids,
                amounts: transaction.amounts
            })
            return
        } else {
            await transfer({
                from: transaction.from,
                to: transaction.to,
                ids: transaction.ids,
                amounts: transaction.amounts
            })
        }
    }
    global.cacheTransaction = [];
}

exports.randomCards = async (wallet_address) => {
    const allCount = await Ownership.sum('amount')
    const charactersCount = await Ownership.sum('amount',{
        where: {
            owner_address: wallet_address,
        },
        include: [{"model": Token, as: 'tokens', 
            where: {
                trait: {
                    [Op.and]: {
                        [Op.gte]: 0,
                        [Op.lt]: 3
                    }
                }
            },
        }]
    });
    const shieldsCount = await Ownership.sum('amount', {
        where: {
            owner_address: wallet_address,
        },
        include: [{"model": Token, as: 'tokens', 
            where: {
                trait: {
                    [Op.and]: {
                        [Op.gte]: 6,
                        [Op.lt]: 9
                    }
                }
            },
        }]
    });
    const weaponsCount = await Ownership.sum('amount', {
        where: {
            owner_address: wallet_address,
        },
        include: [{"model": Token, as: 'tokens', 
            where: {
                trait: {
                    [Op.and]: {
                        [Op.gte]: 3,
                        [Op.lt]: 6
                    }
                }
            },
        }]
    });
    if(allCount < 18 || charactersCount < 3 || shieldsCount < 3 || weaponsCount < 3) {
        return false; // not enough cards
    }
    
    const allCards = await Ownership.findAll({
        where: {
            owner_address: wallet_address
        },
        include: [{"model": Token, as: 'tokens'}]
    })
    const characters = await Ownership.findAll({
        attributes: ['token_id'],
        where: {
            owner_address: wallet_address,
        },
        include: [{"model": Token, as: 'tokens', 
            where: {
                trait: {
                    [Op.and]: {
                        [Op.gte]: 0,
                        [Op.lt]: 3
                    }
                }
            },
        }]
    });
    const shields = await Ownership.findAll({
        attributes: ['token_id'],
        where: {
            owner_address: wallet_address,
        },
        include: [{"model": Token, as: 'tokens', 
            where: {
                trait: {
                    [Op.and]: {
                        [Op.gte]: 6,
                        [Op.lt]: 9
                    }
                }
            },
        }]
    });
    const weapons = await Ownership.findAll({
        attributes: ['token_id'],
        where: {
            owner_address: wallet_address,
        },
        include: [{"model": Token, as: 'tokens', 
            where: {
                trait: {
                    [Op.and]: {
                        [Op.gte]: 3,
                        [Op.lt]: 6
                    }
                }
            },
        }]
    });
    
    const cards = [];
    const t_res = randoms(3, characters.length)
    cards.push(characters[t_res[0]].tokens)
    cards.push(characters[t_res[1]].tokens)
    cards.push(characters[t_res[2]].tokens)
    const s_res = randoms(3, shields.length)
    cards.push(shields[s_res[0]].tokens)
    cards.push(shields[s_res[1]].tokens)
    cards.push(shields[s_res[2]].tokens)
    const w_res = randoms(3, weapons.length)
    cards.push(weapons[w_res[0]].tokens)
    cards.push(weapons[w_res[1]].tokens)
    cards.push(weapons[w_res[2]].tokens)

    const rest_cards = randoms(9, allCards.length);
    for(let i=0; i<9; i++) {
        cards.push(allCards[rest_cards[i]].tokens)
    }
    return shuffle(cards)
}

exports.recordGameResult = async (players, amount) => {
    if(players[0].gameInfo.ongoingStatus > players[1].gameInfo.ongoingStatus) {
        await updateMatch(players[0], 1, amount);
        await updateMatch(players[1], -1, amount);
    }
    if(players[0].gameInfo.ongoingStatus < players[1].gameInfo.ongoingStatus) {
        await updateMatch(players[0], -1, amount);
        await updateMatch(players[1], 1, amount);
    }      
    console.log(players[0].gameInfo.burnIds)
    console.log(players[1].gameInfo.burnIds)
    console.log(players[0].gameInfo.mintIds)
    console.log(players[1].gameInfo.mintIds)
}

const updateMatch = async (player, result, amount) => {
    const user = await User.findOne({
        where: {
            wallet_address: player.personInfo.wallet_address
        }
    });
    if(result == 1) {
        await user.update({
            win_count: user.win_count+1,
            total_price: user.total_price + amount
        });
    } else {
        await user.update({
            lose_count: user.lose_count+1
        });
    }
    await user.save();
}

const randoms = (count, length) => {
    const array = []
    for(let i=0; i<count; i++) {
        array.push(Math.round(Math.random()*(length-1)))
    }
    return array;
}
