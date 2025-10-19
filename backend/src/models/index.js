const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    define: {
      underscored: true,
      timestamps: false
    }
  }
);

const db = { sequelize, Sequelize };

db.Player = require('./player')(sequelize);
db.Game = require('./game')(sequelize);

db.Player.hasMany(db.Game, { foreignKey: 'player1_id', as: 'gamesAsPlayer1' });
db.Player.hasMany(db.Game, { foreignKey: 'player2_id', as: 'gamesAsPlayer2' });


db.Player.hasMany(db.Game, { foreignKey: 'winner_id', as: 'gamesWon' });

db.Game.belongsTo(db.Player, { foreignKey: 'player1_id', as: 'player1' });
db.Game.belongsTo(db.Player, { foreignKey: 'player2_id', as: 'player2' });
db.Game.belongsTo(db.Player, { foreignKey: 'winner_id', as: 'winner' });

module.exports = db;
