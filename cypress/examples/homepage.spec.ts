describe('Homepage', () => {
  it('should load the homepage', () => {
    cy.visit('https://example.com');
    cy.get('h1').should('contain', 'Example Domain');
  });

  it('should have correct title', () => {
    cy.visit('https://example.com');
    cy.title().should('eq', 'Example Domain');
  });

  it('should display more information link', () => {
    cy.visit('https://example.com');
    cy.get('a')
      .should('be.visible')
      .and('have.attr', 'href', 'https://www.iana.org/domains/example');
  });

  it('should return 200 status', () => {
    cy.request('https://example.com').its('status').should('eq', 200);
  });
});
