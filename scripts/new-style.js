var fixMenu = document.querySelector("#fixMenu"),
    right = document.querySelector("#right"),
    addrow = document.querySelector("#addrow");
fixMenu.addEventListener("click", function () {
    right.classList.toggle("show"), addrow.classList.toggle("show"), this.classList.toggle("show")
});
