module.exports = (sequelize, Sequelize) => {
	const Nft = sequelize.define('nft', {
		owner_address: {
			type: Sequelize.STRING,
		},
		token_id: {
			type: Sequelize.INTEGER,
		},
		trait: {
			type: Sequelize.INTEGER,
		},
		strength: {
			type: Sequelize.INTEGER,
		},
		img_url: {
			type: Sequelize.TEXT,
		},
	});

	return Nft;
};