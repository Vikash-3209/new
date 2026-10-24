const menuButton = document.querySelector('.landing-menu-toggle');
const navigation = document.querySelector('#landing-navigation');

menuButton.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) {
    navigation.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  }
});

document.querySelector('#landing-year').textContent = new Date().getFullYear();
