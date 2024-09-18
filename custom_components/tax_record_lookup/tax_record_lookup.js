class TaxRecordLookup extends HTMLElement {
  constructor() {
    super();

    // Get Site Studio custom component form data
    this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));

    this.users = [];

    this.innerHTML = `
      <div>
        <form id="lookupForm">
          <div class="form-item">
            <label>First Name:</label>
            <input type="text" id="fname" placeholder="First Name">
          </div>
          <div class="form-item">
            <label>Last Name:</label>
            <input type="text" id="lname" placeholder="Last Name">
          </div>
          <div class="form-item">
            <label>SSN:</label>
            <input type="text" id="ssn" placeholder="SSN">
          </div>
          <button type="submit">Search</button>
          <button type="button" id="resetButton" style="display:none;">Reset</button>
        </form>
        <table id="resultTable" style="display:none;">
          <thead>
            <tr>
              <th>Year</th>
              <th>Annual Income</th>
              <th>Tax Paid</th>
              <th>Filing Status</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    // Fetch the external JSON file with user data
    this.fetchUserData();

    // Add event listeners for the form submission and reset button
    this.querySelector('#lookupForm').addEventListener('submit', this.lookupUser.bind(this));
    this.querySelector('#resetButton').addEventListener('click', this.resetForm.bind(this));
  }

  async fetchUserData() {
    try {
      const response = await fetch(this.config.endpoint);
      const data = await response.json();
      this.users = data.users;
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }

  lookupUser(event) {
    event.preventDefault();
    const fname = this.querySelector('#fname').value.toLowerCase();
    const lname = this.querySelector('#lname').value.toLowerCase();
    const ssn = this.querySelector('#ssn').value;

    let foundUser = null;

    // Search by SSN if provided
    if (ssn) {
      foundUser = this.users.find(user => user.ssn === ssn);
    } else if (fname && lname) {
      // Search by first name and last name
      foundUser = this.users.find(user => user.fname.toLowerCase() === fname && user.lname.toLowerCase() === lname);
    }

    if (foundUser) {
      this.displayTaxRecords(foundUser.tax_info);
      this.querySelector('#resetButton').style.display = 'inline';
    } else {
      alert('User not found!');
      this.querySelector('#resultTable').style.display = 'none';
    }
  }

  displayTaxRecords(taxInfo) {
    const tableBody = this.querySelector('#resultTable tbody');
    tableBody.innerHTML = '';  // Clear previous results

    taxInfo.forEach(record => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${record.year}</td>
        <td>${record.annual_income}</td>
        <td>${record.tax_paid}</td>
        <td>${record.filing_status}</td>
      `;
      tableBody.appendChild(row);
    });

    this.querySelector('#resultTable').style.display = 'table';
  }
  resetForm() {
    // Clear the form inputs
    this.querySelector('#fname').value = '';
    this.querySelector('#lname').value = '';
    this.querySelector('#ssn').value = '';

    // Hide the results table and reset button
    this.querySelector('#resultTable').style.display = 'none';
    this.querySelector('#resetButton').style.display = 'none';
  }
}

customElements.define('tax-record-lookup', TaxRecordLookup);
