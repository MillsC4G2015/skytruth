"""A simple example of connecting to Earth Engine using App Engine."""



# Works in the local development environment and when deployed.
# If successful, shows a single web page with the SRTM DEM
# displayed in a Google Map.  See accompanying README file for
# instructions on how to set up authentication.

import os
import config
import ee
import jinja2
import webapp2
import json

jinja_environment = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)))


class MainPage(webapp2.RequestHandler):
  def get(self):                             # pylint: disable=g-bad-name
    """Request an ImageCollection from Earth Engine filtered by date and render it to a web page."""
    ee.Initialize(config.EE_CREDENTIALS, config.EE_URL)		# logs in as credentialed appspot user
    imageCollection = ee.ImageCollection("LANDSAT/LE7_L1T")	# imports Landsat 7 Raw Scenes as desired image type
    geometry = ee.Geometry.Polygon(				# imports the Polygon class so user can hard-code four-cornered shape for image collection queries
	[[[-97.03125, 27.963354676702952],
	  [-82.44140625, 28.273423646227233],
	  [-83.84765625, 30.266658976560755],
	  [-97.91015625, 30.1907194801663]]])
    myImageCollection = imageCollection.filterBounds(geometry).filterDate('2014-01-01', '2014-03-31')	# hard-coded duration of time from which images should be extracted.
    coll = myImageCollection.getInfo()									# sets variable as the properties of the images pulled
    result = []												# initialized empty list to populate with image IDs
    for each in range(0, len(coll)):
	imageID = coll["features"][each]["id"]								# variable holding each of the LS7 image's unique ID
	result.append(imageID)
    list_ = result											# declare list variable that includes unicode character in generated list
    list_as_json = json.dumps(list_)									# get rid of the unicode character
    print list_as_json											# print the list of image IDs without the unicode character
	



    # These could be put directly into template.render, but it
    # helps make the script more readable to pull them out here, especially
    # if this is expanded to include more variables.
    template_values = {
        'myList': result					# sends clean image ID list to index.html file to be rendered on a web page once app is deployed
    }
    template = jinja_environment.get_template('index.html')
    self.response.out.write(template.render(template_values))

app = webapp2.WSGIApplication([('/', MainPage)], debug=True)
