const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

//mongoose.connect('mongodb://localhost:27017/productTests', { useNewUrlParser: true, useUnifiedTopology: true });
//mongoose.connect('https://prod.netint.ca/admin/', { useNewUrlParser: true, useUnifiedTopology: true });
const encodedPassword = encodeURIComponent('!@369588');
console.log(encodedPassword); 
mongoose.connect('mongodb+srv://lerong_Qi:!%40369588@cluster0.zanzara.mongodb.net/productTests', { useNewUrlParser: true, useUnifiedTopology: true });//this is where we can set to connect to different database

const testSchema = new mongoose.Schema({
    board_serial_number: String,
    test_time_and_date: String,
    Pass_or_Fail: String,
    failed_test: String,
    customer_FW_version: String,
    comment: String // 添加 comment 字段
});

const Test = mongoose.model('Test', testSchema);

const app = express();

app.use(bodyParser.json());
//app.use(express.static('public'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

app.get('/collections', async (req, res) => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        res.status(200).json(collections.map(col => col.name));
    } catch (err) {
        res.status(500).json({ error: 'Could not fetch collections' });
    }
});

app.get('/collections/:name', async (req, res) => {
    const collectionName = req.params.name;
    const page = parseInt(req.query.page) || 1; // 获取页码，默认为第1页
    const limit = 40; // 每页显示40条数据
    const skip = (page - 1) * limit; // 计算跳过的数据条数

    const passFail = req.query.passFail;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const filter = {};

    if (startDate) {
        filter.test_time_and_date = filter.test_time_and_date || {};
        filter.test_time_and_date.$gte = startDate;
    }

    if (endDate) {
        filter.test_time_and_date = filter.test_time_and_date || {};
        filter.test_time_and_date.$lte = endDate;
    }

    try {
        const DynamicModel = mongoose.model(collectionName, testSchema, collectionName);
        let documents = await DynamicModel.find(filter).skip(skip).limit(limit);

        // 根据 Pass_or_Fail 过滤
        if (passFail) {
            documents = documents.filter(doc => {
                const passOrFailValues = doc.Pass_or_Fail.trim().split('\n').map(value => value.trim());
                const lastValue = passOrFailValues[passOrFailValues.length - 1];
                return lastValue === passFail;
            });
        }

        const totalDocuments = await DynamicModel.countDocuments(filter);
        const totalFilteredDocuments = await DynamicModel.countDocuments({ ...filter, Pass_or_Fail: passFail });
        res.status(200).json({
            totalDocuments,
            totalFilteredDocuments,
            documents,
            totalPages: Math.ceil(totalDocuments / limit),
            currentPage: page
        });
    } catch (err) {
        res.status(500).json({ error: 'Could not fetch the documents' });
    }
});

app.get('/search', async (req, res) => {
    const searchTerm = req.query.q;
    if (!searchTerm) {
        return res.status(400).json({ error: 'Search term is required' });
    }

    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const searchResults = [];

        for (const collection of collections) {
            const DynamicModel = mongoose.model(collection.name, testSchema, collection.name);
            const results = await DynamicModel.find({
                $or: [
                    { board_serial_number: { $regex: searchTerm, $options: 'i' } },
                    { test_time_and_date: { $regex: searchTerm, $options: 'i' } },
                    { Pass_or_Fail: { $regex: searchTerm, $options: 'i' } },
                    { failed_test: { $regex: searchTerm, $options: 'i' } },
                    { customer_FW_version: { $regex: searchTerm, $options: 'i' } },
                    { comment: { $regex: searchTerm, $options: 'i' } } // 添加 comment 字段
                ]
            });
            searchResults.push(...results);
        }

        res.status(200).json(searchResults);
    } catch (err) {
        res.status(500).json({ error: 'Could not perform search' });
    }
});

// app.delete('/collections/:name', async (req, res) => {
//     const collectionName = req.params.name;
//     try {
//         const DynamicModel = mongoose.model(collectionName, testSchema, collectionName);
//         await DynamicModel.deleteMany({});
//         res.status(200).send('Data cleared successfully');
//     } catch (err) {
//         res.status(500).json({ error: 'Could not clear the data' });
//     }
// });

app.delete('/collections/:name', async (req, res) => {
    const collectionName = req.params.name;
    try {
        await mongoose.connection.db.dropCollection(collectionName);
        res.status(200).send('Collection deleted successfully');
    } catch (err) {
        res.status(500).json({ error: 'Could not delete the collection' });
    }
});

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    try {
        const workbook = xlsx.readFile(filePath);
        const sheet_name_list = workbook.SheetNames;
        const xlData = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

        const processedData = xlData.map(item => {
            if (item.customer_FW_version === "") {
                item.customer_FW_version = "None";
            }
            return item;
        });

        const collectionName = path.basename(req.file.originalname, path.extname(req.file.originalname));
        const DynamicModel = mongoose.model(collectionName, testSchema, collectionName);

        await DynamicModel.insertMany(processedData);
        res.status(200).send('Data imported successfully');
    } catch (err) {
        res.status(500).json({ error: 'Could not import the data' });
    }
});

// 添加更新评论的路由
app.patch('/collections/:collectionName/:id/comment', async (req, res) => {
    const { collectionName, id } = req.params;
    const { comment } = req.body;

    try {
        const DynamicModel = mongoose.model(collectionName, testSchema, collectionName);
        await DynamicModel.findByIdAndUpdate(id, { comment });
        res.status(200).send('Comment updated successfully');
    } catch (err) {
        res.status(500).json({ error: 'Could not update the comment' });
    }
});

//process.env.PORT = 

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});