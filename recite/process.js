var text = document.getElementById("wait4process").innerText;
var tmparray = text.split("\n");
var textarray = [];

for (var i = 0; i < tmparray.length; i++) {
	if(tmparray[i] != "") {
		var txt = tmparray[i].trim();
		if(txt != "") {
			textarray.push(txt);
		}
	}
}

var maincontent = document.getElementById("main-content");

var currentpos = 0;

function displayFirstLine() {
	maincontent.innerText = textarray[0];
	currentpos = 0;
}

function displayPreLine() {
	if(currentpos > 0) {
		currentpos--;
		maincontent.innerText = textarray[currentpos];
	}
}

function displayNextLine() {
	if(currentpos < (textarray.length - 1)) {
		currentpos++;
		maincontent.innerText = textarray[currentpos];
	}
}

displayFirstLine();