/** @format */

module.exports = (sequelize, Sequelize) => {
	const User = sequelize.define('user', {
		user_name: {
			type: Sequelize.STRING,
		},
		wallet_address: {
			type: Sequelize.STRING,
		},
		img_url: {
			type: Sequelize.STRING,
		},
		total_price: {
			type: Sequelize.FLOAT,
		},
		win_count: {
			type: Sequelize.INTEGER,
		},
		lose_count: {
			type: Sequelize.INTEGER,
		},
	});

	return User;
};
