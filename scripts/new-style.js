var fixMenu = document.querySelector("#fixMenu")
var right = document.querySelector("#right")
var addrow = document.querySelector("#addrow")
fixMenu.addEventListener('click', function () {
    right.classList.toggle('show');
    addrow.classList.toggle('show');
    this.classList.toggle('show');
})
