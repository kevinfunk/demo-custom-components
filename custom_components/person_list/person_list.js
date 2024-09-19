class PersonList extends HTMLElement {
  constructor() {
    super();

    // Get Site Studio custom component form data
    this.config = JSON.parse(this.parentNode.getAttribute('data-ssa-custom-component'));
    this.baseUrl = this.config.baseurl;
    this.filterName = this.config.filtername;
    this.filterNumber = this.config.filternumber;

    // Define the SVG placeholder (Base64 encoded)
    this.svgPlaceholderBase64 = `data:image/svg+xml;base64,${btoa(`
      <svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#e0e0e0"/>
        <text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" fill="#888" font-size="16">No Image</text>
      </svg>
    `)}`;
  }

  connectedCallback() {
    this.render();
  }

  async render() {
    const resultDiv = document.createElement('div');
    resultDiv.id = 'result';
    this.appendChild(resultDiv);

    // Clear previous result
    resultDiv.innerHTML = '';

    // Check if base URL is set
    if (!this.baseUrl) {
      resultDiv.innerHTML = '<p>Base URL is not set. Please configure the base URL.</p>';
      return;
    }

    try {
      const apiUrl = `${this.baseUrl}/jsonapi/node/person`;

      // Fetch the JSON data from the person endpoint
      const personResponse = await fetch(apiUrl);
      if (!personResponse.ok) throw new Error(`Person API error: ${personResponse.status} ${personResponse.statusText}`);

      const personData = await personResponse.json();
      if (!personData.data || !Array.isArray(personData.data)) {
        throw new Error("Person API response is missing 'data' or it's not an array.");
      }

      // Function to fetch media or file by ID
      const fetchById = async (type, id) => {
        const response = await fetch(`${this.baseUrl}/jsonapi/${type}/${id}`);
        if (!response.ok) {
          console.warn(`${type.charAt(0).toUpperCase() + type.slice(1)} API error: ${response.status} ${response.statusText}`);
          return null;
        }
        const data = await response.json();
        return data.data;
      };

      // Function to get the image URL from file data
      const getImageUrlFromFile = async (fileId) => {
        const file = await fetchById('file/file', fileId);
        return file && file.attributes && file.attributes.uri ? `${this.baseUrl}${file.attributes.uri.url}` : '';
      };

      // Function to find the image associated with a person
      const findImageForPerson = async (person) => {
        const personImageRelationship = person.relationships?.field_person_image?.data;
        if (personImageRelationship) {
          const mediaId = personImageRelationship.id;
          const mediaImage = await fetchById('media/image', mediaId);
          if (mediaImage && mediaImage.relationships?.image?.data) {
            const fileId = mediaImage.relationships.image.data.id;
            return getImageUrlFromFile(fileId);
          }
        }
        return '';
      };

      // Filtering
      const filterName = typeof this.filterName === 'string' ? this.filterName.toLowerCase() : '';
      const filterNumber = typeof this.filterNumber === 'number' ? this.filterNumber : null;

      // Filter by name if filterName is provided
      const filteredPeople = filterName
        ? personData.data.filter(person => person.attributes.title.toLowerCase().includes(filterName))
        : personData.data;

      // Limit results by filterNumber if it is set
      const limitedPeople = filterNumber !== null ? filteredPeople.slice(0, filterNumber) : filteredPeople;

      let resultsHtml = '';

      if (limitedPeople.length > 0) {
        for (const person of limitedPeople) {
          const title = person.attributes.title;
          const imageUrl = await findImageForPerson(person) || this.svgPlaceholderBase64;
          resultsHtml += `
            <div class="person-card">
              <img src="${imageUrl}" alt="${title}">
              <div class="title">${title}</div>
            </div>
          `;
        }
      } else {
        resultDiv.innerHTML = '<p>No results found.</p>';
        return;
      }

      resultDiv.innerHTML = resultsHtml;
    } catch (error) {
      resultDiv.innerHTML = `<p>There was an error fetching the data: ${error.message}</p>`;
    }
  }
}

customElements.define('person-list', PersonList);
