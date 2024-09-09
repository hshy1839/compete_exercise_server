const mongoose = require("mongoose");
const saltRounds = 10;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userSchema = mongoose.Schema({
    name: {
        type: String,
        maxlength: 50,
    },
    username: {
        type: String,
        trim: true,
        unique: 1,
    },
    password: {
        type: String,
        minlength: 5,
    },
    phoneNumber: {
        type: String,
        maxlength : 20,
        unique: true, // Ensures phone number is unique
        required: [true, 'Phone number is required'],
    },
    birthdate: {
        type: Date,
    },
    role: {
        type: Number,
        default: 0,
    },
    image: String,
    token: {
        type: String,
    },
    tokenExp: {
        type: Number,
    },
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

// 토큰 생성 메소드
userSchema.methods.generateToken = async function () {
    const user = this;
    const token = jwt.sign({ _id: user._id.toHexString() }, 'your_jwt_secret');
    user.token = token;

    try {
        await user.save();
        return token;
    } catch (err) {
        throw new Error('Token 생성 및 저장 오류: ' + err.message);
    }
};

const User = mongoose.model("User", userSchema);

module.exports = { User };
