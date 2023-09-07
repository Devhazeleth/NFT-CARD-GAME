module.exports = (sequelize, Sequelize) => {
	const History = sequelize.define('history', {
		from: {
			type: Sequelize.STRING,
		},
		to: {
			type: Sequelize.STRING,
		},
		token_id: {
			type: Sequelize.INTEGER,
		},
		amount: {
			type: Sequelize.INTEGER,
		},
		block_num: {
			type: Sequelize.INTEGER,
		}
	});

	return History;
};
