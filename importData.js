const mongoose = require('mongoose');
const xlsx = require('xlsx');

mongoose.connect('mongodb://localhost:27017/productTests', { useNewUrlParser: true, useUnifiedTopology: true });

const testSchema = new mongoose.Schema({
    board_serial_number: String,
    test_time_and_date: String,
    Pass_or_Fail: String,
    failed_test: String,
    customer_FW_version: String
});

const Test = mongoose.model('Test', testSchema);

const workbook = xlsx.readFile('C:/Users/lerong.qi/Python_Script/All_log_excels/Qin_Zhu_folder/Q1A_C111.xlsx');
const sheet_name_list = workbook.SheetNames;
const xlData = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

// 预处理数据，将 customer_FW_version 为空字符串的项转换为 "None"
const processedData = xlData.map(item => {
    if (item.customer_FW_version === "") {
        item.customer_FW_version = "None";
    }
    return item;
});

Test.insertMany(processedData)
    .then(() => {
        console.log('Data imported successfully');
        mongoose.connection.close();
    })
    .catch(err => {
        console.error('Error importing data', err);
        mongoose.connection.close();
    });