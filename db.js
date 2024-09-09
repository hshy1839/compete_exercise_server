const mongoose = require('mongoose')
const connectDB = async () => { mongoose.connect('mongodb+srv://hshy1839:wghdtjrgud3!@competeex.43eet.mongodb.net/')
  .then(() => console.log('MogoDB 연결 성공'))
  .catch((err) => console.error('MogoDB 연결 실패:', err));
}
  module.exports = connectDB;