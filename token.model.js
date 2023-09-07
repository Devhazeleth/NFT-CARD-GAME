module.exports = (sequelize, Sequelize) => {
	const Token = sequelize.define('token', {
		token_id: {
			type: Sequelize.INTEGER,
		},
		trait: {
			type: Sequelize.INTEGER,
		},
		strength: {
			type: Sequelize.INTEGER,
		},
		src: {
			type: Sequelize.TEXT,
		},
	});
	return Token;
};