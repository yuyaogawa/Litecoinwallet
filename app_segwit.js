/*******************************************************/
// 2017/11/21 by Yuya Ogawa
//
// To implement Litecoin, there are something that you have to know.
// * This Litecoin wallet is used BitcoinJS library instead of Litecore-lib which does
//   not support pure Javascript. Litecore-lib can be run on only Node.js.
// * Chain.so is used for APIs( get Balacne, send Transaction, get LTC price and realtime update).
// * The mining fee is 200 litoshis per byte. There is no Api to get the litecoin fee.
// * OP_Return is available but there are few information how to deal with it.
//   So, I removed this function from Litecoin wallet.
// * There is no validatation for Litecoin address currently.
// * dustThreshold is 54600 which is $0.04USD (2017/11/20)
// * Realtime update is available if you use Pusher JavaScript Library v2.1.6.
//   Do not use latest version of pusher library because it does not support for chain.so server...
// * Only Non P2SH address is supported.
//
// @TODO
// * Bitcoin.address.fromBase58Check : When does it return 48. What does 48 mean?
//                                     What litecoin address does it support?
// * Send function                   : Sometimes it does not work...
// * Reduce response time            : As my research for the slow response time, it is caused by DXW_APP.php
//
/*******************************************************/

    /*******************************************************/
    // This is the code for DexWallet.
    //
    // 1) generateAddress()
    //    Controls several ways to generate an address.
    //    Look at the documentation for login process flow chart.
    //
    // 2) checkPassword()
    //    Check the password when the url has ! mark.
    //
    // 3) createAddress()
    //    Create BitcoinAddress with Mnemonics(BIP39).
    //    There are 4 ways to create an address.
    //     (2) with Mnemonic(*1) + password
    //     (3) with Mnemonic(*1)
    //     (5) with new Mnemonic + password
    //     (6) with new Mnemonic
    //    *1 It is 12 words retrieved from URL after # tag.
    //
    // 4) getTxHistory(address)
    //    Get the TxHistory with Blockexplorer API.
    //     * https://blockexplorer.com/api/txs/
    //
    // 5) getBalance(address)
    //    Get the Balance with Bitcore API(insight).
    //
    // 6) calcFee()
    //    Calculate mining fees before broadcasting.
    //
    // 7) sendBitcoin()
    //    Sned BTC from your own Address to Receiveing Address with Bitcore API(insight).
    //
    // 8) scanQRcode()
    //    Scan QRcode with the below library. This function is run only on HTTPS.
    //    https://github.com/dwa012/html5-qrcode.git
    //
    // 9) stopCamera()
    //    Stop Scanner.
    //
    // 10) getCurrency(balances)
    //    Get currency with API.
    //     * https://blockchain.info/ticker
    //
    // 11) generateQRcode()
    //    GenerateQRcode by using GoogleAPI
    //
    // 12) getBitcoinFee()
    //    Get recommended fees by using bitcoinfees21 API
    //
    // 13) setCookie()
    //    Well, we might consider using localStorage instead of Cookies. localStorage is more secure and space to store data.
    //    Currently, I am using setCookie function...
    //    https://stackoverflow.com/questions/3220660/local-storage-vs-cookies
    //
    // 14) readCookie()
    //
    // 15) validateInputs()
    //    Validate 2 things as following
    //     (1) Addresss       : If it is valid address for Bitcoin in Mainnet
    //     (2) Amount of BTC  : If the wallet has enough money that you want to send
    //
    // Other functions
    // dispLoading,removeLoading,showMessage,openTab,formatMoney,btcFormat
    //
    /*******************************************************/

    const ERROR = "ERROR";
    const SUCCESS = "SUCCESS";
    const WRONGPASSWORD = "WRONGPASSWORD";
    
    const url_currency = 'https://blockchain.info/ticker';
    const url_ltcprice = 'https://api.coinmarketcap.com/v1/ticker/litecoin/';
    const url_balance = 'https://chain.so/api/v2/address/LTC/';
    const url_balance2 = 'https://chain.so/api/v2/get_address_balance/LTC/';
    const url_fee = 'https://bitcoinfees.21.co/api/v1/fees/recommended';
    const url_fee2 = 'https://api.blockcypher.com/v1/ltc/main';
    const url_tx ='https://blockexplorer.com/api/txs/?address=';
    const url_qr = "https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=http://dexcoin.ca/litecoin/index.html%23";
    const url_receiving = "https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=bitcoin%3A";
    const url_dex = "https://dexcoin.ca/api/DXW_API.php";
    
    const MSG_BALANCE = "Sorry, we can't show your bitcoin balance at this moment because the third party didn't reply. Try to refresh your browser.";
    const MSG_HISTORY = "Sorry, we can't show your transaction history at this moment because the third party didn't reply. Try to refresh your browser.";
    const MSG_SOCKET = "Sorry, we can't connect the third party at this moment because the third party didn't reply. Try to refresh your browser.";
    const MSG_FEE = "Sorry, we can't show recommended mining fees at this moment because the third party didn't reply. Try to refresh your browser.";
    const MSG_CURRENCY = "Sorry, we can't show currency at this moment because the third party didn't reply. Try to refresh your browser.";
    const MSG_INVALIDADDR = "Receiving address is invalid.";
    const MSG_MEMOPOOL = "Sorry, this is the Litecoin Memopool bug that the core team are fixing. Try to change the amount of LTC that you want to send.";
    const MSG_UNKNOWN_ERROR1 = "Sorry, we can't estimate the transaction fee at this moment because the third party didn't reply.";
    const MSG_UNKNOWN_ERROR2 = "Sorry, we can't make the transaction at this moment because the third party didn't reply.";
    const MSG_NOFEE = "Not enougth BTC";
    const TIMEOUT = 10000 // timeout for APIs and 10000 = 10 secounds
    //var bitcore = require('bitcore-lib');
    //var networks = bitcore.Networks.litecoin;// You can switch mainnet or testnet. Pick up either "mainnet" or "testnet".
    var Mnemonic = require('bitcore-mnemonic');
    //var explorers = require('bitcore-explorers');
    //var insight = new explorers.Insight(networks);
    var wif;
    var address;
    var useFiat = false;
    var currency;
    var fiatvalue;
    var objCurrency;
    var sym;
    var balance = 0;
    var estsize;
    var message;
    var password = "";
    var hash;
    var newurl;
    var code;
    var Mseed;
    var passChksum;
    var fee = 50;// We use a API to get mining fees. 50 satoshis per byte is the fee just in case that the API won't return the fess.
    var lat = 0;
    var lng = 0;
    var alt = 0;
    var jsonString = '{"Documentation":{"REQ":"INITIALIZE","REP":" ","LOG":"Login"}}' ;
    var jsonArray = JSON.parse ( jsonString );
    jsonArray.Documentation.REQ='INITIALIZE';
    //Litecoin
    var litecoin = Bitcoin.networks.litecoin;
    var keyPair;
    const FEE_PER_BYTE = 200;
    var txsize = 250;// Dummy txsize in order to calc
    var price_btc;
    const dustThreshold = 54600;
    var redeemScript;



    // We use cookie to just store your currency. USD is the default currency.
    if (readCookie("currency") != ""){
        this.currency = readCookie("currency");
    }else{
        this.currency = 'USD';
    }
    // Set up Global functions
    dex = window.dex = {
        "useFiat": false,
        "useFiat2": false,
        "pusher": function(address){
            Pusher.host = 'slanger1.chain.so'; // our server
            Pusher.ws_port = 443; // our server's port
            Pusher.wss_port = 443; // ...

            // create the pusher client connection
            var pusher = new Pusher('e9f5cc20074501ca7395', { encrypted: true, disabledTransports: ['sockjs'], disableStats: true });

            // subscribe to the channel for address balance updates (new transactions only)
            var channel = 'address_ltc_' + address;
            var ticker = pusher.subscribe(channel);
            console.log(pusher);

            ticker.bind('balance_update', function(data) {
                if (data.type == "address") {
                  // update an HTML div or span with the new content, for e.g.: data.value.balance_change
                  playBeep();
                  console.log(data);
                  getBalance(address);
                  getTxHistory(address);
                }
            });
        },
        // blockchain does not support LITECOIN so this function can be used for only Bitcon wallet.
        "openSocket": function(address){
            var socket = new WebSocket("wss://ws.blockchain.info/inv");
            socket.onopen = function (msg)
            {
                var message = {
                    "op": 'addr_sub',
                    "addr": address
                };


                socket.send(JSON.stringify(message));
            }

            socket.onerror = function () {
                //$('#apiErrorBox').show();
                //alert("apiError");
                showMessage(ERROR,MSG_SOCKET);
            }

            socket.onmessage = function (msg)
            {
                setTimeout(function ()
                {
                    if ( true )
                    {
                        //playBeep();
                        alert("Beep!");
                        getBalance(address);
                    }

                }, 500);
            }
        },
        "regExp": function(str){
            var regex = /^[a-z_]*$/;
            if(str.match(regex)){
                return true;
            }else{
                return false;
            }
        },
        "setCurrency": function (currency){
            setCookie("currency", currency, 100);
        },
        "getFiatPrefix": function(){
            switch ( currency )
            {
                case "AUD":
                case "USD":
                case "CAD":
                case "CLP":
                case "HKD":
                case "NZD":
                case "SGD":
                    return "$";
                    break;
                case "BRL":
                    return "R$"; 
                case "CHF":
                    return "CHF";
                case "CNY":
                    return "¥";
                case "DKK":
                    return "kr";
                case "EUR":
                    return "€";
                case "GBP":
                    return "£";
                case "INR":
                    return "";
                case "ISK":
                    return "kr";
                case "JPY":
                    return "¥";
                case "KRW":
                    return "₩";
                case "PLN":
                    return "zł";
                case "RUB":
                    return "RUB";
                case "SEK":
                    return "kr";
                case "THB":
                    return "TŁ";
                case "TWD":
                    return "NT$";
                default:
                    return "$";
            }
        },
        "amountFiatValue": function (){
            var amount = $("#txtAmount").val();
            amount = parseFloat(amount);

            if (!amount){
                amount = 0;
            }
            if ( dex.useFiat ){
                var btcValue = amount / fiatvalue;
                $("#fiatPrice").html("(Ł" + btcFormat( btcValue ) + ")");
            } else {
                var fiatValue = fiatvalue * amount;
                fiatValue = fiatValue.toFixed(2);
                $("#fiatPrice").html("(" + this.getFiatPrefix() + formatMoney(fiatValue) + currency + ")");
            }
        },
        "amountFiatValue2": function (){
            var amount = $("#Recamount").val();
            amount = parseFloat(amount);

            if (!amount){
                amount = 0;
            }
            if ( dex.useFiat2 ){
                var btcValue = amount / fiatvalue;
                $("#fiatPrice2").html("(Ł" + btcFormat( btcValue ) + ")");
            } else {
                var fiatValue = fiatvalue * amount;
                fiatValue = fiatValue.toFixed(2);
                $("#fiatPrice2").html("(" + this.getFiatPrefix() + formatMoney(fiatValue) + currency + ")");
            }
        },
        "amountFiatValue3": function (btc){
            var amount = btc;
            amount = parseFloat(amount);

            if (!amount){
                amount = 0;
            }
            var fiatValue = fiatvalue * amount;
            fiatValue = fiatValue.toFixed(2);
            $("#fiatPrice3").html("(" + this.getFiatPrefix() + formatMoney(fiatValue) + currency + ")");
        },
        "checkAddress": function (address){
            try
            {
                var res = Bitcoin.address.fromBase58Check(address);
                var version = res.version;
                // 5  is for addresses start with 3( p2sh address)
                // 48 is for addresses start with L( standard address)
                // 50 is for addresses start with M( segwit address)
                // Also, p2sh and segwit are interchangable
                if (version == 5 || version == 48 || version == 50 )
                    return true;
            }
            catch (err)
            {
                return false;
            }
        }
    };
    // Set up EventListener
    $(document).on("click", '#choiceCurrency', function (event){
        $("#settingsCurrency").show();
        $("#settingsChoices").hide();
        //$("#settingsTitleText").html( "Set Currency" );
    });
    $(document).on("click", '#settings', function (event){
        //$("#defaultFeePlaceholder").text(0);
        $("#settingsChoices").show();
        $("#settingsModal").modal("show");
        $("#settingsCurrency, #settingsBackup").hide();
        //$("#settingsTitleText").html( "Settings" );
        //$("#settingModal").modal("show");
    }); 
    $(document).on("change", '#currencySelect', function (event){
        currency = $(this).val();
        if ( dex.useFiat ){
            $(".addonBox").html( dex.getFiatPrefix() );
        }
        dex.setCurrency(currency);
        fiatvalue = objCurrency[currency].last;
        sym = objCurrency[currency].symbol;
        $('#currency').text(' ≈ ' + sym + (balance*fiatvalue).toFixed(2) + currency);
    }); 
    $(document).on("change", '#feeSelect', function (event){
        var feeSelect = parseInt($(this).val());
        fee = parseFloat(feeSelect);
        $("#txtFeeAmount").val(fee);
    });
    $(document).on("click", '#choiceBackup', function (event){
        var url = window.location.hash.substring(1);
        var arr = url.split('!');
        // If a user sets up password, go to the first api.
        // If not, go to the second api.
        if(arr.length > 1){
            $("#qrUrl4Bk").attr("src", url_qr + arr[0] + "%21" + arr[1] + "&chld=H|0");
        }else{
            $("#qrUrl4Bk").attr("src", url_qr + arr[0] + "&chld=H|0");
        }
        
        $("#settingsBackup").show();
        $("#settingsChoices").hide();

        $("#txtMnemonic4Bk").val( code );
        $("#txtPassword4Bk").val( password );
        $("#backupUrl").val( window.location );
        $("#backupPubkey").val( address.toString() );
    });
    $(document).on("keyup", '#txtFeeAmount', function (event){
        if ($(this).val().length > 0 && $(this).val() > 0 && !isNaN( $(this).val() ) ){
            amount = $(this).val();
            fee = parseFloat(amount);
        }
    });
    $(document).on("click", '#changeType', function (e){
        if ( $("#changeType .addonBox").html() == "Ł" )
        {
            $("#changeType .addonBox").html( dex.getFiatPrefix() );
            dex.useFiat = true;
            dex.amountFiatValue();
            //if ( !mobilecheck() )
                $("#txtAmount").focus();
        } else {
            $("#changeType .addonBox").html("Ł");
            dex.useFiat = false;
            dex.amountFiatValue();
            //if ( !mobilecheck() )
                $("#txtAmount").focus();
        }
    });
    $(document).on("click", '#changeType2', function (e){
        if ( $("#changeType2 .addonBox").html() == "Ł" )
        {
            $("#changeType2 .addonBox").html( dex.getFiatPrefix() );
            dex.useFiat2 = true;
            dex.amountFiatValue2();
            //if ( !mobilecheck() )
                $("#Recamount").focus();
        } else {
            $("#changeType2 .addonBox").html("Ł");
            dex.useFiat2 = false;
            dex.amountFiatValue2();
            //if ( !mobilecheck() )
                $("#Recamount").focus();
        }
    });
    $(document).on("keyup", '#txtAmount', function (event){

        amount = $(this).val();
        if ( dex.useFiat ){
            amount = parseFloat(amount) / fiatvalue;
            amount = btcFormat(amount);
        }
        if ( $(this).val().length > 0 ){
            dex.amountFiatValue();
        }else{
            $("#fiatPrice").html("");
            $(this).css({"font-size":"14px"});
        }
        /**
        if ( $(this).val().length > 0 && parseFloat(amount) <= balance && parseFloat(amount) * 100000000 > bitcore.Transaction.DUST_AMOUNT){
            $("#sendBtn").removeAttr("disabled");
        } else {
            $("#sendBtn").attr("disabled", "disabled").html("Send");
        }
        **/
        if(validateInputs()){
            $("#sendBtn").removeAttr("disabled");
        }else{
            $("#sendBtn").attr("disabled", "disabled").html("CONFIRM");
        }
    });
    $(document).on("keyup", '#sendAddr', function (event){
        if(validateInputs()){
            $("#sendBtn").removeAttr("disabled");
        }else{
            $("#sendBtn").attr("disabled", "disabled").html("CONFIRM");
        }
    });
    $(document).on("keyup", '#Recamount', function (event){
        amount = $(this).val();

        if ( dex.useFiat2 )
        {
            amount = parseFloat( amount ) / fiatvalue;
            amount = btcFormat( amount );
        }
        if ( $(this).val().length > 0 )
        {
            dex.amountFiatValue2();
        }
        else
        {
            $("#fiatPrice2").html("");
            $(this).css({"font-size":"14px"});
        }
    });
    $(document).on("click", '#openSend', function (event){
        $("#receive").collapse('hide');
    }); 
    $(document).on("click", '#openReceive', function (event){
        $("#send").collapse('hide');
    }); 
    $(document).on("click", '#sendBtn', function (event){
        $("#fee").text(fee);
        $("#miningfee").text((fee * 200 * 1e-8).toFixed(8));
        calcFee();
    });
    $(document).on("click", '#setupPassword', function (event){
        $("#passwordBox").show();
        $("#txtPassword").focus();
    });
    $(document).on("click", '#btnPrint', function (event){
        var elem = document.getElementById("settingsBackup");
        var domClone = elem.cloneNode(true);
        var $printSection = document.getElementById("printSection");
        if (!$printSection) {
            var $printSection = document.createElement("div");
            $printSection.id = "printSection";
            document.body.appendChild($printSection);
        }
        $printSection.innerHTML = "";
        $printSection.appendChild(domClone);
        window.print();
    });
    $(document).on("click", "[data-hide]", function(event){
        $(this).closest("." + $(this).attr("data-hide")).hide();
    });
    $(document).on("click", '#infoFee', function(event){
        $("#infoModal").modal("show");
        openTab(event, 'SEND');
    });
    $(document).on("keypress", "#txtPassword", function(event){
      if(event.keyCode == 13){
        $('#loginBtn').click();
        //generateAddress5();
      }
    });
    $(document).on("keypress","#chkPassword", function(event){
      if(event.keyCode == 13){
        $('#loginBtn2').click();
        //checkPassword();
      }
    });


    getLocation();

    // Login process starts from here.
    // Look at the documentation for login process(Login.xls).
    // window.location is a function to get strings of URL
    // Code for "If # exists"
    hash = window.location.hash.substring(1);
    if(hash.length > 0){
        // Code for "If ! exists"
        if (hash.indexOf("!") > 0){
            // (1) Show password view
            $(document).ready(function(){
                $("#enterPassword").modal("show");
                $('#enterPassword').on('shown.bs.modal', function () {
                    $('#chkPassword').focus();
                })
            });
        }else{
            // (3) Generate an address with Mnemonic( which retrieved from URL after #tag).
            generateAddress3();
        }
    }else{
        // Ask a user if they want to set up password
        // If they say Yes, (4) Show setup password view and after setting up it (5) Generate an address with new Mnemonic + password.
        // If they say No,  (6) Generate and address with new Mnemonic + password.
        $(document).ready(function(){
            $("#passwordModal").modal("show");
            $("#passwordModal").draggable({
              handle: ".modal-header"
            });
        });
    }

/********************** Functions*********************************/
    // This function controls several ways to generate an address.
    // Use "Promise" to call createAddress() so that left of functions will be pending until an address is created.
    // This is a good example to use "Promise" and "Then" function.
    // Do not wirte code looks like below because there is no promise that getBalance will be excuted after creating an address.
    // Bad example is here
    //    createAddress();
    //    getBalance(address);
    //    getTxHistory(address); 
    function generateAddress2(){
        if(dex.regExp(hash)){
            js_GetEncryption("ENCRYPT2",hash);
        }else{
            js_GetEncryption("DECRYPT",hash);
        }
        js_GetServerInfo("LOGIN");
    }
    function generateAddress3(){
        if(dex.regExp(hash)){
            js_GetEncryption("ENCRYPT2",hash);
        }else{
            js_GetEncryption("DECRYPT",hash);
        }
        js_GetServerInfo("LOGIN");
    }
    function generateAddress5(){
        // (5) Generate an address with new Mnemonic + password.
        password = $("#txtPassword").val();
        $.when(createAddress()).then(
            getBalance(address),
            getTxHistory(address),
            getBitcoinFee()
        );
        js_GetEncryption("ENCRYPT",newurl);
        js_GetServerInfo("CREATE");
    }
    function generateAddress6(){
        // Code for (6)
        $.when(createAddress()).then(
                getBalance(address),
                getTxHistory(address),
                getBitcoinFee()
            );
        js_GetEncryption("ENCRYPT",newurl);
        js_GetServerInfo("CREATE");
    }
    // Check the password and if it is correct, (2) Generate an address with Mnemonic + password.
    function checkPassword(){
        var hashArr = hash.split("!");
        password = $("#chkPassword").val();
        //var userPassHash = bitcore.crypto.Hash.sha256(new buffer.Buffer(password) );
        // deal with Litecoin
        var userPassHash = Bitcoin.crypto.sha256(new buffer.Buffer(password) );
        var passChk = userPassHash.toString('hex').substring(0, 10);
        if (passChk == hashArr[1]){
            hash = hashArr[0];
            passChksum = passChk;
            generateAddress2();
            $("#enterPassword").modal("hide");
        }else{
            showMessage(WRONGPASSWORD,"Incorrect! <br> Do not mistake more than 3 times Otherwise your wallet will be gone ;)");
        }
    }
    // Create Bitcoin Address
    // BIP39 Mnemonics https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
    // Usage of bitcoin-menominc https://github.com/bitpay/bitcore-mnemonic
    // Generate Masterseed and Code which has 12 English words.
    // if you want to create same address, you must put same code that you have created before into Mnomonic().
    // Below is an example that generate an address by using phrase so that you can  genreate same address.
    //  var code = new Mnomonic(phrase);
    // if you want to create new an address, try below.
    //  var code = new Mnomonic();
    // Use below when you want to create Bitcoin Address for testnet3
    //var Mseed = code.toHDPrivateKey(phrase2,keyNetwork);
    function createAddress(){
        var dfd = jQuery.Deferred();

        if(hash.length > 0 ){
            hash = hash.replace(/_/g, " ");
            code = new Mnemonic(hash);
            //If a user has the password, (2) Generate an address with Mnemonic + password.
            //If no, (3) Generate an address with Mnemonics
            if(password.length>0){
                Mseed = code.toHDPrivateKey(password);
            }else{
                Mseed = code.toHDPrivateKey();
            }
        }else{
            // Create a new address
            // If a user wants to set up password, (5) generate an address with new Mnemonic + password
            // If no, (6) Generate an address with new Mnemonic
            if(password.length > 0 ){
                code = new Mnemonic();
                newurl = (code.toString()).replace(/ /g, "_");
                // Codes for Password
                //var userPassHash =  bitcore.crypto.Hash.sha256(new buffer.Buffer(password) );
                // deal with Litecoin
                var userPassHash =  Bitcoin.crypto.sha256(new buffer.Buffer(password) );
                passChksum = userPassHash.toString('hex').substring(0, 10);
                location.replace("#" + newurl + "!" + passChksum);
                Mseed = code.toHDPrivateKey(password);
            }else{
                code = new Mnemonic();
                newurl = (code.toString()).replace(/ /g, "_");
                location.replace("#" + newurl);
                Mseed = code.toHDPrivateKey();
            }
        }

        /**
        var hdPrivateKey = new bitcore.HDPrivateKey(Mseed);
        var derivedHdPrivateKey = hdPrivateKey.derive("m/44'/0'/0'/0/1");
        var privateKey = derivedHdPrivateKey.privateKey;
        //var derivedPrivateKey = hdPrivateKey.privateKey;
        //wif = derivedPrivateKey;
        var derivedHdPublicKey = derivedHdPrivateKey.hdPublicKey;
        var derivedPublicKey = derivedHdPublicKey.publicKey;
        address = derivedPublicKey.toAddress();
        wif = privateKey;
        var p = bitcore.PrivateKey.fromWIF(wif.toString());
        **/
        /**

        keyPair = Bitcoin.ECPair.fromWIF('T7N53GtaFkrcC1VyVAZsF7aWUiqt92kT2yJW9GyHG42JHS8ake4v',litecoin);
        //Litecoin address LKXNXegFrD6CDYdbfAUJjB19QPfG7MDJ2w
        wif = keyPair.toWIF();
        address = keyPair.getAddress();
        **/
        //Litecoin
        // We followed the BIP44(https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
        //var path = "m/44'/0'/0'/0/1"// This is for Bitcoin
        //var path = "m/44'/2'/0'/0/1"// This is for Litecoin

        var path = "m/44'/0'/0'/0/1"
        var Mseed = code.toSeed(code);
        //var Mseed = code.toSeed(code);
        var root = Bitcoin.HDNode.fromSeedBuffer(Mseed,litecoin);
        var child1 = root.derivePath(path);
        keyPair = child1;
        address = child1.getAddress();
        wif = child1.keyPair.toWIF();
        // Generate SegWit address via P2SH
        var pubKey = keyPair.getPublicKeyBuffer()
        redeemScript = Bitcoin.script.witnessPubKeyHash.output.encode(Bitcoin.crypto.hash160(pubKey))
        var scriptPubKey = Bitcoin.script.scriptHash.output.encode(Bitcoin.crypto.hash160(redeemScript))
        address = Bitcoin.address.fromOutputScript(scriptPubKey,Bitcoin.networks.litecoin)

        console.log("Litecoin: " + address);
        console.log("wif: " + wif);


        $(document).ready(function(){
             $('#qrcode').qrcode({                       //Bitcoin Address
                 width:100,
                 height:100,
                 text:address.toString()
            });
             $('#publicKey').text(address.toString());
        });
        dex.pusher(address);

        return dfd.promise();
    }
    // Get History
    // There are some companys that offer Bitcoin APIs. However, some are not allowed us to use Ajax(CORS issue).
    // There is a list if companys provide APIs with Ajax.
    // OK) blockexplorer.com
    // NG) blockchain.info 
    function getTxHistory(address){
        var address2 = convert(address);
        $.ajax({
            type: "GET",
            //url: url_tx + address,
            url: url_balance + address2,
            async: true,
            dataType: "json",
            timeout:TIMEOUT,
        })
          // Code to run if the request succeeds (is done);
          // The response is passed to the function
          .done(function( json ) {
            $('#history').find("tr:gt(3)").remove();
            var obj = json.data.txs;
            var i = 0;
            $.each(obj, function(index, element) {
                if(i==10){
                    return true;
                }else{
                    i++;
                }
                var amount = 0;
                var inputsum = 0;
                var receiveflag = 0;
                // Transaction for recivieing
                    if(!obj[index].hasOwnProperty('outgoing')){
                        amount = obj[index].incoming.value;
                    }else{
                        amount -= obj[index].outgoing.outputs[0].value;
                    }

                    var trHTML = '<tr>';
                    // [Input]
                    // Unless you specify a time zone offset, parsing a string will breate a date in the CURRENT TIME ZONE.
                    trHTML += '<td>&nbsp;</td>';
                    trHTML += '<td align="left">' + moment(obj[index].time*1000).format( "MMM D YYYY h:mma" ) + '&nbsp;&nbsp;</td>';

                    trHTML += '<td  class="hidden-sm hidden-xs" align="left" text-overflow="ellipsis"><a target="_blank" href="https://insight.litecore.io/tx/' + obj[index].txid + '">' + (obj[index].txid).substring(0, 40) + '</a></td>';
                    trHTML += '<td align="left"><a target="_blank" href="https://insight.litecore.io/tx/' + obj[index].txid + '">'  + '...</a>' + '&nbsp;&nbsp;</td>';
                    trHTML += '<td  class="hidden-sm hidden-xs" align="right">' + obj[index].confirmations + '&nbsp;&nbsp;</td>';
                    if(amount >= 0){
                        trHTML += '<td align="right" class="BTC_IN">' + parseFloat(amount).toFixed(8) + '</td>';
                    }else{
                        trHTML += '<td align="right" class="BTC_OUT">' + parseFloat(amount).toFixed(8) + '</td>';
                    }
                    trHTML += '<td>&nbsp;</td></tr><tr><td>&nbsp;</td>';

                    trHTML += '</tr>';
                    $('#history tr:last').after(trHTML);
            });
            if(json.data.txs.length > 0){
                $("#nohistory").hide();
                $("#history").show();
            }else{
                $("#history").hide();
                $("#nohistory").show();
            }
          })
          // Code to run if the request fails; the raw request and
          // status codes are passed to the function
          .fail(function( xhr, status, errorThrown ) {
            showMessage(ERROR,MSG_HISTORY);
            $("#history").hide();
            $("#nohistory").show();
          })
          // Code to run regardless of success or failure;
          .always(function( xhr, status ) {
            //alert( "The request is complete!" );
          });
    }
    // Get balance with API
    function getBalance(address) {
        var address2 = convert(address);
        $.ajax({       
            type: "GET",
            url: url_balance2 + address2,
            async: true,
            dataType: "json",
        })
        .done(function( json ) {
            balance = btcFormat(parseFloat(json.data.confirmed_balance) + parseFloat(json.data.unconfirmed_balance));
            getCurrency(balance);
            $(document).ready(function(){
                    $('#balance').text(balance + ' LTC');
                });
          })
        .fail(function( xhr, status, errorThrown ) {
            //alert( "Sorry, there was a problem!" );
            showMessage(ERROR,MSG_BALANCE);
            console.log( "Error: " + errorThrown );
            console.log( "Status: " + status );
            console.dir( xhr );
          })
        .always(function( xhr, status ) {
            //alert( "The request is complete!" );
          });
    }

    // No calcFee for Litecoin
    // Calculate mining fees before broadcasting.
    // This fee is not exact same amount of fee when you actually broadcast because we can't calculate before you sign the transaction.
    function calcFee(){
        //var privateKey = bitcore.PrivateKey.fromWIF(wif.toString());
        var send_address = document.getElementById("sendAddr").value;
        var amount = document.getElementById("txtAmount").value;
        // Convert BTC to satoshi;
        if(dex.useFiat){
            amount = parseFloat( amount ) / fiatvalue;
            amount = btcFormat( amount );
        }
        amount = parseInt((amount * 1e8).toFixed(0));
        //Check unspentUtxos
        const url_utxo = 'https://chain.so/api/v2/get_tx_unspent/LTC/';
        const url_send = 'https://chain.so//api/v2/send_tx/LTC';
        var address2 = convert(address);
        $.ajax({
            type: "GET",
            url: url_utxo  + address2,
            async: true,
            dataType: "json",
        })
        .done(function( json ) {
            var unspents = json.data.txs;
            if(unspents.length > 0){
                // Sum of utxos that you have had so far.
                var balance = 0;
                for (var i=0;i<unspents.length;i++){
                    balance += parseInt((unspents[i]['value'] * 1e8).toFixed(0));
                }
                    // Fee Calc
                    var txb = new Bitcoin.TransactionBuilder(litecoin);
                    var sum = 0;
                    var i = 0;
                    while(sum < amount){
                        sum += parseInt((unspents[i]['value'] * 1e8).toFixed(0));
                        txb.addInput(unspents[i].txid, unspents[i].output_no);
                        i++;
                    }
                    txb.addOutput(send_address, amount);// receiving address
                    txb.addOutput(address, (balance - amount));//change address but dummy to deal with uncertain fee.
                    for(var j =0;j<i;j++){
                        //txb.sign(j, keyPair.keyPair);
                        // To deal with segwit transaction
                        txb.sign(j, keyPair.keyPair,redeemScript,null,parseInt((unspents[j]['value'] * 1e8).toFixed(0)));
                    }
                    txsize = txb.build().toHex().length/2;
                    console.log(txsize);
                    var tx = new Bitcoin.Transaction.fromHex(txb.build().toHex());
                    console.log(tx.virtualSize());
                    txsize = tx.virtualSize();

                    $("#miningfee").text((fee * txsize * 1e-8).toFixed(8));
                    var fiatValue = fiatvalue * fee * txsize * 1e-8;
                    fiatValue = fiatValue.toFixed(2);
                    $("#fiatfeePrice").html("(" + dex.getFiatPrefix() + formatMoney(fiatValue) + currency + ")");
            }else{
                showMessage(ERROR,MSG_NOFEE);
            }
          })
        .fail(function( xhr, status, errorThrown ) {
            //alert( "Sorry, there was a problem!" );
            //console.log( "Error: " + errorThrown );
            //console.log( "Status: " + status );
            $("#sendModal").modal("hide");
            showMessage(ERROR,MSG_UNKNOWN_ERROR1);
            removeLoading();
          })
          // Code to run regardless of success or failure;
        .always(function( xhr, status ) {
            //alert( "The request is complete!" );
          });

    }
    // Send Bitcoin to another address
    function sendBitcoin() {
        //var privateKey = bitcore.PrivateKey.fromWIF(wif.toString());
        var send_address = document.getElementById("sendAddr").value;
        var amount = document.getElementById("txtAmount").value;
        // Convert BTC to satoshi;
        if(dex.useFiat){
            amount = parseFloat( amount ) / fiatvalue;
            amount = btcFormat( amount );
        }
        amount = parseInt((amount * 1e8).toFixed(0));
        dispLoading();
        //Check unspentUtxos
        const url_utxo = 'https://chain.so/api/v2/get_tx_unspent/LTC/';
        const url_send = 'https://chain.so//api/v2/send_tx/LTC';
        var address2 = convert(address);
        $.ajax({
            type: "GET",
            url: url_utxo  + address2,
            async: true,
            dataType: "json",
        })
        .done(function( json ) {
            console.log(json.data.txs);
            var unspents = json.data.txs;
            if(unspents.length > 0){
                // Sum of utxos that you have had so far.
                var balance = 0;
                for (var i=0;i<unspents.length;i++){
                    balance += parseInt((unspents[i]['value'] * 1e8).toFixed(0));
                }
                // Check if you have enought amount of LTC that you are about to send.
                if(balance < amount + (fee * txsize)){
                    showMessage(ERROR,MSG_NOFEE);
                    removeLoading();
                }else{
                    // Build a transcation
                    var txb = new Bitcoin.TransactionBuilder(litecoin);
                    var sum = 0;
                    var i = 0;
                    while(sum < amount + (fee * txsize)){
                        sum += parseInt((unspents[i]['value'] * 1e8).toFixed(0));
                        txb.addInput(unspents[i].txid, unspents[i].output_no);
                        i++;
                    }
                    txb.addOutput(send_address, amount);// receiving address
                    txb.addOutput(address, (sum - (amount + (fee * txsize))));//change address
                    for(var j =0;j<i;j++){
                        //txb.sign(j, keyPair.keyPair);
                        // To deal with segwit transaction
                        txb.sign(j, keyPair.keyPair,redeemScript,null,parseInt((unspents[j]['value'] * 1e8).toFixed(0)));
                    }
                    console.log(txb.build().toHex().length);
                    console.log(txb.build().toHex());

                    $.ajax({
                        type: "POST",
                        url: url_send,
                        async: true,
                        data: "tx_hex="+txb.build().toHex()
                    })
                    .done(function( json ) {
                        console.log(json);
                        removeLoading();
                        showMessage(SUCCESS,"You successfully sent!");
                        getBalance(address);
                        getTxHistory(address);
                        console.log(json.data.txid);
                        //js_GetServerInfo("SEND",txid);
                      })
                    .fail(function( xhr, status, errorThrown ) {
                        showMessage(ERROR,MSG_MEMOPOOL);
                        removeLoading();
                      })
                      // Code to run regardless of success or failure;
                    .always(function( xhr, status ) {
                        //alert( "The request is complete!" );
                        console.log(xhr);
                        removeLoading();
                      });
                }
                

            }else{
                showMessage(ERROR,MSG_NOFEE);
                removeLoading();
            }
          })
        .fail(function( xhr, status, errorThrown ) {
            //alert( "Sorry, there was a problem!" );
            showMessage(ERROR,MSG_UNKNOWN_ERROR2);
            removeLoading();
          })
          // Code to run regardless of success or failure;
        .always(function( xhr, status ) {
            //alert( "The request is complete!" );
          });
    }
    // Scan QRcode
    // The original library(dwa012/html5-qrcode) has a issue which is "Camera view hang when running it on mobile #8".
    // But also there is a fork to solve it, so I used the fork library as followed "enriquetuya/html5-qrcode"
    function scanQRcode(){
        $('#reader').empty();
        $('#reader').html5_qrcode(function(data){
                var scanArr = data.split("?");
                if(scanArr.length > 1){
                    document.getElementById('txtAmount').value = scanArr[1].replace('amount=','');
                    //$("#changeType").trigger("click");
                }
                document.getElementById('sendAddr').value = scanArr[0].replace('bitcoin:','');
                
                try{
                    //$('#reader').html5_qrcode_stop();
                    //$('#reader').html5_qrcode().stop();
                    if (!!window.stream) {
                        stream.getTracks().forEach(function (track) { track.stop(); });
                    }
                    $('#reader').value = null;
                    $("#ScannerModal").modal("hide");
                } catch(err){
                    console.log(err);
                }
            },
            function(error){
            //show read errors 
            }, function(videoError){
            //the video stream could be opened
            }
        );
    }
    // Stop Scanner
    function stopCamera(){
        try{
            //$('#reader').html5_qrcode_stop();
            //$('#reader').html5_qrcode().stop();
            if (!!window.stream) {
                stream.getTracks().forEach(function (track) { track.stop(); });
            }
            $('#reader').value = null;
        } catch(err){
            console.log(err);
        }
    }
    // Get currency with API
    function getCurrency(balance){
        $.ajax({
            type: "GET",
            url: url_ltcprice,
            async: true,
            dataType: "json",
            timeout:TIMEOUT,
        })
        .done(function( json ) {
            price_btc = json[0].price_btc;
            console.log(price_btc);
            $.ajax({
            type: "GET",
            url: url_currency,
            async: true,
            dataType: "json",
            timeout:TIMEOUT,
        })
            .done(function( json ) {
                // Convert BTC to LTC of price
                $.each(json, function (i, fb) {
                    fb.last = fb.last * price_btc;
                });
                objCurrency = json;// Store the json to use settingCurrecny.
                fiatvalue = json[currency].last;
                sym = json[currency].symbol;
                $(document).ready(function(){
                    $('#currency').text(' ≈ ' + sym + (balance*fiatvalue).toFixed(2) + currency);
                    var i;
                    $('#currencySelect').empty();
                    for ( i in json ){
                        $("#currencySelect").append( "<option value='" + i + "'>" + i + "</option>" );
                    }
                });
              })
            .fail(function( xhr, status, errorThrown ) {
                showMessage(ERROR,MSG_CURRENCY);
              })
            .always(function( xhr, status ) {
                //alert( "The request is complete!" );
              });
            })
        .fail(function( xhr, status, errorThrown ) {
            showMessage(ERROR,MSG_CURRENCY);
          })
        .always(function( xhr, status ) {
            //alert( "The request is complete!" );
          });
    }
    // GenerateQRcode by using GoogleAPI
    function generateQRcode(){
        var amount = $("#Recamount").val();
        if ( dex.useFiat2 )
        {
            amount = parseFloat( amount ) / fiatvalue;
            amount = btcFormat( amount );
        }
        $("#receiveQR").attr("src", url_receiving + this.address + "%3Famount%3D" + amount + "&chld=H|0");
        $("#generateAmount").html(amount);
        $("#generateAddress").html(this.address.toString());
        dex.amountFiatValue3(amount);
    }
    // Get currency with API
    function getBitcoinFee(){
        $.ajax({
            type: "GET",
            url: url_fee2,
            async: true,
            dataType: "json",
            timeout:TIMEOUT,
        })
        .done(function( json ) {
            $(document).ready(function(){
                    //var i;
                    //var feeText = ["/byte (high)","/byte (medium)","/byte (low)"];
                    //var f = 0;
                    //var defaultFee = 50;
                    //$("#feeSelect").append( "<option value='" + defaultFee + "'>" + defaultFee + "/byte (Default)</option>" );
                    //for ( i in json ){
                    //    $("#feeSelect").append( "<option value='" + json.medium_fee_per_kb + "'>" + json.medium_fee_per_kb + feeText[f] + "</option>" );
                    //    f++;
                    //}
                    //fee = parseInt(json["fastestFee"]);
                    var high = (json.high_fee_per_kb / 1000).toFixed(0);
                    var medium = (json.medium_fee_per_kb / 1000).toFixed(0);
                    var low = (json.low_fee_per_kb / 1000).toFixed(0);
                    $("#feeSelect").append( "<option id='1' value='" + high + "'>" + high + " litoshis/byte (high) </option>" );
                    $("#feeSelect").append( "<option id='2' value='" + medium + "'>" + medium + " litoshis/byte (medium) </option>" );
                    $("#feeSelect").append( "<option id='3' value='" + low + "'>" + low + " litoshis/byte (low) </option>" );

                    fee = medium;
                    $("#txtFeeAmount").val(fee);
                    //$('#feeSelect option:1').prop('selected', true);
                    $("select#feeSelect").find("option#2").attr("selected", true);
                });
          })
          .fail(function( xhr, status, errorThrown ) {
            showMessage(ERROR,MSG_FEE);
            fee = 100; // If Api doesn't response, 100 litoshi per byte is default fee.
            $("#txtFeeAmount").val(fee);
          })
          .always(function( xhr, status ) {
            //alert( "The request is complete!" );
          });
    }
    //Validate inputs
    function validateInputs(){
            var amount = $("#txtAmount").val();
            var send_address = $("#sendAddr").val();
            var chk;
            if(send_address.length > 0){
                //error = bitcore.Address.getValidationError(send_address, networks);
                //error = false;
                chk = dex.checkAddress(send_address);
            }else{
                chk = false; //Receiving address is empty
            }
            if(chk){
                if ( dex.useFiat ){
                    amount = parseFloat(amount) / fiatvalue;
                    amount = btcFormat(amount);
                }
                if ( amount.length > 0 ){
                    dex.amountFiatValue();
                }else{
                    $("#fiatPrice").html("");
                    $(this).css({"font-size":"14px"});
                }
                if ( amount.length > 0 && parseFloat(amount) <= balance && parseFloat(amount) * 100000000 > dustThreshold){
                    return true;
                } else {
                    return false;
                }
            }else{
                return false;
            }
    }


    // Show Loading Modal
    function dispLoading(){
        var h = $(window).height();
        $('#loader-bg ,#loader').height(h).css('display','block');
    }
    // Remove Loading Modal
    function removeLoading(){
        $('#loader-bg').delay(900).fadeOut(800);
        $('#loader').delay(600).fadeOut(300);
    }
    function showMessage(str,msg){
        if(str == ERROR){
            $('#errorMsg').html(msg);
            $("#error").fadeTo(9000, 500);
        }else if(str == SUCCESS){
            $('#success').html(msg);
                $("#success").fadeTo(9000, 500).slideUp(500, function(){
                $("#success").slideUp(500);
            });
        }else if(str == WRONGPASSWORD){
            $('#wrongPassword').html(msg);
                $("#wrongPassword").fadeTo(9000, 500).slideUp(500, function(){
                $("#wrongPassword").slideUp(500);
            });
        }else{
            alert("something wrong...");
        }
    }
    function setCookie(cookieName,cookieValue,nDays) {
        var today = new Date();
        var expire = new Date();
        if (nDays==null || nDays==0) nDays=1;
        expire.setTime(today.getTime() + 3600000*24*nDays);
        document.cookie = cookieName+"="+escape(cookieValue) + ";expires="+expire.toGMTString();
    }
    function readCookie(cookieName) {
        var theCookie=" "+document.cookie;
        var ind=theCookie.indexOf(" "+cookieName+"=");
        if (ind==-1) ind=theCookie.indexOf(";"+cookieName+"=");
        if (ind==-1 || cookieName=="") return "";
        var ind1=theCookie.indexOf(";",ind+1);
        if (ind1==-1) ind1=theCookie.length; 
        return unescape(theCookie.substring(ind+cookieName.length+2,ind1));
    }
    function openTab(evt, tabName) {
        // Declare all variables
        var i, tabcontent, tablinks;

        // Get all elements with class="tabcontent" and hide them
        tabcontent = document.getElementsByClassName("tabcontent");
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }

        // Get all elements with class="tablinks" and remove the class "active"
        tablinks = document.getElementsByClassName("tablinks");
        for (i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }

        // Show the current tab, and add an "active" class to the button that opened the tab
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
    }
    function formatMoney(x){
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    function btcFormat(amount){
        var amount = amount.toFixed(8);
        return amount;
    }
    function playBeep(){
        var snd = document.getElementById('noise');
        snd.src = './css/balance.wav';
        snd.load();
        snd.play();
    }
    function getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(showPosition);
        } else { 
            console.log("Geolocation is not supported by this browser.");
        }
    }
    function showPosition(position) {
        if(position.coords.latitude != null){
            lat = position.coords.latitude;
        }
        if(position.coords.longitude != null){
            lng = position.coords.longitude;
        }
        if(position.coords.altitude != null){
            alt = position.coords.altitude;
        }
        console.log("latitude: " + lat);
        console.log("longitude: " + lng);
        console.log("altitude: " + alt);
    }
    function js_AjaxCall(cbfunc) {     // this is the only AJAX call, supply callback   
        jsonString=JSON.stringify(jsonArray);
        $.ajax({
              dataType: 'json',
              method: 'POST',
              url: url_dex,
              data: jsonString,
            })
        .done(function( json ) {
            if(cbfunc == 'js_GetEncryption'){
                if(password.length > 0){
                    // Code for (5)
                    location.replace("#" + json.Documentation.NOW + "!" + passChksum);
                }else{
                    // Code for (6)
                    location.replace("#" + json.Documentation.NOW);
                }
            }else if(cbfunc == 'js_GetDecryption'){
                hash = json.Documentation.NOW;
                $.when(createAddress()).then(
                    getBalance(address),
                    getTxHistory(address),
                    getBitcoinFee()
                );
            }else if(cbfunc == 'js_GetEncryption2'){
                $.when(createAddress()).then(
                    getBalance(address),
                    getTxHistory(address),
                    getBitcoinFee()
                );
                if(password.length > 0){
                    // Code for (2)
                    location.replace("#" + json.Documentation.NOW + "!" + passChksum);
                }else{
                    // Code for (3)
                    location.replace("#" + json.Documentation.NOW);
                }
            }else{
                // hundle error
            }
        });
    }
    /**
    function success(response) {
          jsonString=JSON.stringify(response);
            tmp = JSON.stringify(response, null, 4);
    }
    **/
    function js_GetServerInfo(event, data) {
        jsonString = '{"Documentation":{"REQ":"","REP":"","LOG":"","URL":"","TID":"","LAT":"","LNG":"","ALT":""}}';
        jsonArray = JSON.parse ( jsonString );
        switch(event){
            case "LOGIN":
                jsonArray.Documentation.REQ='SERVER';
                jsonArray.Documentation.LOG='*** LOGIN_Litecoin ***';
                jsonArray.Documentation.LAT=lat.toString();
                jsonArray.Documentation.LNG=lng.toString();
                jsonArray.Documentation.ALT=alt.toString();
                break;
            case "SEND":
                jsonArray.Documentation.REQ='SERVER';
                jsonArray.Documentation.LOG='*** SEND_Litecoin ***';
                jsonArray.Documentation.TID= data;
                jsonArray.Documentation.LAT=lat.toString();
                jsonArray.Documentation.LNG=lng.toString();
                jsonArray.Documentation.ALT=alt.toString();
                break;
            case "CREATE":
                jsonArray.Documentation.REQ='SERVER';
                jsonArray.Documentation.LOG='*** CREATE_Litecoin ***';
                jsonArray.Documentation.LAT=lat.toString();
                jsonArray.Documentation.LNG=lng.toString();
                jsonArray.Documentation.ALT=alt.toString();
                break;
            default:
                jsonArray.Documentation.LOG='*** Something else ***';
        }
        js_AjaxCall('js_GotServerInfo');
    }
    function js_GetEncryption(event, data) {
        jsonString = '{"Documentation":{"REQ":"","REP":"","LOG":"","URL":"","TID":"","LAT":"","LNG":"","ALT":""}}';
        jsonArray = JSON.parse ( jsonString );
        switch(event){
            case "ENCRYPT":
                jsonArray.Documentation.REQ='ENCRYPT';
                jsonArray.Documentation.LOG= data;
                jsonArray.Documentation.LAT=lat.toString();
                jsonArray.Documentation.LNG=lng.toString();
                jsonArray.Documentation.ALT=alt.toString();
                js_AjaxCall('js_GetEncryption');
                break;
            case "ENCRYPT2":
                jsonArray.Documentation.REQ='ENCRYPT';
                jsonArray.Documentation.LOG= data;
                jsonArray.Documentation.LAT=lat.toString();
                jsonArray.Documentation.LNG=lng.toString();
                jsonArray.Documentation.ALT=alt.toString();
                js_AjaxCall('js_GetEncryption2');
                break;
            case "DECRYPT":
                jsonArray.Documentation.REQ='DECRYPT';
                jsonArray.Documentation.LOG= data;
                jsonArray.Documentation.LAT=lat.toString();
                jsonArray.Documentation.LNG=lng.toString();
                jsonArray.Documentation.ALT=alt.toString();
                js_AjaxCall('js_GetDecryption');
                break;
            default:
                jsonArray.Documentation.LOG='*** Something else ***';
        }
      }
    // this function is powered by https://litecoin-project.github.io/p2sh-convert/#
    function convert(address) {
        try {
            decoded = Bitcoin.address.fromBase58Check(address);
            version = decoded['version']
            switch (version) {
                case 5:
                    message = "Mainnet p2sh address: ";
                    version = 50;
                    break;
                case 50:
                    message = "Mainnet p2sh address (deprecated): ";
                    version = 5;
                    break;
                case 196:
                    message = "Testnet p2sh address: ";
                    version = 58;
                    break;
                case 58:
                    message = "Testnet p2sh address (deprecated): ";
                    version = 196;
                    break;
                default:
                    throw "unknown";
            }
            // 5 <-> 50
            // 196 <-> 58
            address = Bitcoin.address.toBase58Check(decoded['hash'], version);
            return address;
        } catch(err) {
                message = "Please enter a valid address.";
                address = "";
                console.log(err);
        }
    }
/********************** end of functions *********************************/
