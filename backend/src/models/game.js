const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('game', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    game_id: { type: DataTypes.STRING(100), unique: true, allowNull: false },
    player1_id: { type: DataTypes.INTEGER, allowNull: true },
    player2_id: { type: DataTypes.INTEGER, allowNull: true },
    winner_id: { type: DataTypes.INTEGER, allowNull: true },
    result: { type: DataTypes.ENUM('player1','player2','draw','forfeit'), allowNull: false },
    moves: { type: DataTypes.JSON, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    finished_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'games'
  });
};
