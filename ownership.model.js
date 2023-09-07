module.exports = (sequelize, Sequelize) => {
	const Ownership = sequelize.define('ownership', {
		owner_address: {
			type: Sequelize.STRING,
		},
		amount: {
			type: Sequelize.INTEGER,
		}
	});

	return Ownership;
};
