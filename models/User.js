const mongoose = require("mongoose");
const saltRounds = 10;
const bcrypt = require("bcrypt");

const userSchema = mongoose.Schema({
    name: {
        type: String,
        maxlength: 50,
    },
    nickname: {
        type: String,
        maxlength: 12,
        unique: true,
    },
    username: {
        type: String,
        trim: true,
        unique: true,
    },
    password: {
        type: String,
        minlength: 5,
    },
    role: {
        type: Number,
        default: 0,
    },
    phoneNumber: {
        type: String,
        maxlength: 12,
        unique: true,
    },
    image: String,
    // 토큰 및 토큰 만료 관련 필드 제거
    birthdate: {
        type: Date,
        default: null
    },
    followers: { // 새로운 필드 추가
        type: [mongoose.Schema.Types.ObjectId], // ObjectId 배열로 설정
        ref: 'User', // User 모델 참조
        default: [], // 기본값으로 빈 배열 설정,
        unique: true,
      }, // 팔로워 목록
    following: { // 새로운 필드 추가
        type: [mongoose.Schema.Types.ObjectId], // ObjectId 배열로 설정
        ref: 'User', // User 모델 참조
        default: [], // 기본값으로 빈 배열 설정,
        unique: true,
      } // 팔로잉 목록
});


// 비밀번호 암호화
userSchema.pre("save", function (next) {
    const user = this;
    if (user.isModified("password")) {
        bcrypt.genSalt(saltRounds, function (err, salt) {
            if (err) return next(err);
            bcrypt.hash(user.password, salt, function (err, hash) {
                if (err) return next(err);
                user.password = hash;
                next();
            });
        });
    } else {
        next();
    }
});

// 비밀번호 비교 메소드
userSchema.methods.comparePassword = function (candidatePassword) {
    return new Promise((resolve, reject) => {
        bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
            if (err) return reject(err);
            resolve(isMatch);
        });
    });
};

const User = mongoose.model("User", userSchema);

module.exports = { User };

