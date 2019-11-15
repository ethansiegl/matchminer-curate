import {Component, ViewChild, AfterViewInit, OnInit} from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpHandler, HttpHeaders} from '@angular/common/http';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/observable/combineLatest';
import {TrialService} from '../service/trial.service';
import * as _ from 'lodash';
import '../../../../../node_modules/jquery/dist/jquery.js';
import '../../../../../node_modules/datatables.net/js/jquery.dataTables.js';
import * as YAML from 'js-yaml';
import {Subject} from 'rxjs/Subject';
import {DataTableDirective} from 'angular-datatables';
import {Trial} from '../trial/trial.model';
import * as JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import {environment} from "../environments/environment";

@Component({
    selector: 'jhi-converter',
    templateUrl: './converter.component.html',
    styleUrls: ['converter.scss']
})

export class ConverterComponent implements OnInit, AfterViewInit {
    @ViewChild(DataTableDirective)
    dtElement: DataTableDirective;
    trialList: Array<Trial> = [];
    nctIdList = [];
    downloadIdList: Array<string> = [];
    dtOptions: DataTables.Settings = {};
    dtTrigger: Subject<any> = new Subject();
    fileType = 'json';
    filesToUpload: Array<any> = [];
    uploadFileNames = '';
    uploadFailedFileList: Array<string> = [];
    uploadMessage: object = {
        content: '',
        color: ''
    };
    tableDestroied = false;
    mmIntegration = environment.apiAddress ? environment.apiAddress : false;

    constructor(private trialService: TrialService, private http: HttpClient) {
        this.trialService.trialListObs.subscribe((message) => {
            this.trialList = message;
            this.nctIdList = _.map(this.trialList, function (trial) {
                return trial.nct_id;
            });
            this.rerender();
        });
    }

    ngOnInit(): void {
        this.dtOptions = {
            paging: false,
            scrollY: '300'
        };
    }

    ngAfterViewInit(): void {
        this.dtTrigger.next();
    }

    rerender(): void {
        this.tableDestroied = false;
        if (!_.isUndefined(this.dtElement)) {
            this.dtElement.dtInstance.then((dtInstance: DataTables.Api) => {
                // Destroy the table first
                if (!this.tableDestroied) {
                    dtInstance.destroy();
                    // Call the dtTrigger to rerender again
                    this.dtTrigger.next();
                    this.tableDestroied = true;
                }
            });
        }
    }

    downloadSingleTrial(nctId: string, type: string) {
        this.trialService.fetchTrialById(nctId).then((trialJson) => {
            if (!_.isEmpty(trialJson)) {
                this.removeAttributes(trialJson);
                let data = '';
                if (type === 'json') {
                    data = 'text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(trialJson, null, 2));
                } else if (type === 'yml') {
                    data = 'text/x-yaml;charset=utf-8,' + encodeURIComponent(YAML.safeDump(trialJson));
                }
                const a = document.createElement('a');
                a.href = 'data:' + data;
                a.download = nctId + '.' + type;
                a.click();
            } else {
                alert('Download trial ' + nctId + ' failed!');
            }
        });
    }

    downloadTrials(isAll: boolean) {
        const zip = new JSZip();
        const folderName = 'Trials';
        const zipFolder = zip.folder(folderName);
        if (this.downloadIdList.length === 1 && !isAll) {
            this.downloadSingleTrial(this.downloadIdList[0], this.fileType);
            return;
        }
        if (isAll) {
            this.createTrialZipFile(this.nctIdList, zipFolder, true);
        } else if (this.downloadIdList.length > 1) {
            this.createTrialZipFile(this.downloadIdList, zipFolder, false);
        }
        zip.generateAsync({type: 'blob'}).then(function (content) {
            FileSaver.saveAs(content, folderName + '.zip');
        }, function (err) {
            console.log(err);
        });
    }

    importIntoMatchMiner(isAll: boolean) {
        let to_download = [];
        const download_list = this.downloadIdList;
        const trial_list = this.trialList;
        const _class = this;

        if (isAll) {
            to_download = trial_list;
        } else {
            _.forEach(trial_list, function(trial) {
                if (download_list.includes(trial['nct_id']) === true) {
                    to_download.push(trial);
                }
            });
        }
        _.forEach(to_download, function(trial) {
            _class.importSingleTrial(trial);
        }, this);
    }

    importSingleTrial(trial: object) {
        let headers = new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': environment.apiToken,
            'Cache-Control': 'no-cache'
        });
        const _class = this;
        this.removeAttributes(trial);
        this.formatForMatchMiner(trial);

        let url = environment.apiAddress + '?where=%22nct_id%22==%22'+ trial['nct_id'] +'%22';
        let mm_api_trial = this.http.get(url).toPromise();
        mm_api_trial.then(res => {
            if (res['_items'].length == 0) {
                let re = this.http.post(environment.apiAddress, JSON.stringify(trial), {headers: headers}).toPromise();
                re.then(res => {
                    _class.uploadMessage['content'] += 'Imported Successfully ' + trial['nct_id'] + ' (' + trial['protocol_no'] + ')\n';
                    _class.uploadMessage['color'] = 'green';
                }).catch(res => {
                    _class.uploadMessage['content'] += 'Error importing ' + trial['nct_id'] + ' (' + trial['protocol_no'] + ')\n';
                    _class.uploadMessage['color'] = 'red';
                    console.log(res)
                });
            } else {
                let api_trial = res['_items'][0];
                let patch_url = environment.apiAddress + '/' + api_trial['_id'];
                headers = headers.append('If-Match', api_trial['_etag']);
                let patch_re = this.http.put(patch_url, JSON.stringify(trial), {headers: headers}).toPromise();
                patch_re.then(res => {
                    _class.uploadMessage['content'] += 'Imported Successfully ' + trial['nct_id'] + ' (' + trial['protocol_no'] + ')\n';
                    _class.uploadMessage['color'] = 'green';
                }).catch(res => {
                    _class.uploadMessage['content'] += 'Error importing ' + trial['nct_id'] + ' (' + trial['protocol_no'] + ')\n';
                    _class.uploadMessage['color'] = 'red';
                    console.log(res)
                });
            }
        })
    }

    createTrialZipFile(idList: Array<string>, zipFolder: any, isAll?: boolean) {
        let content = '';
        if (isAll) {
            _.forEach(this.trialList, function (trialJson) {
                this.removeAttributes(trialJson);
                const nctId = trialJson['nct_id'];
                if (this.fileType === 'json') {
                    content = JSON.stringify(trialJson, null, 2);
                } else {
                    content = YAML.safeDump(trialJson);
                }
                // create a folder and a file
                zipFolder.file(nctId + '.' + this.fileType, content);
            }, this);
        } else {
            _.forEach(idList, function (nctId) {
                _.forEach(this.trialList, function (trialJson) {
                    if (nctId === trialJson['nct_id']) {
                        this.removeAttributes(trialJson);
                        if (this.fileType === 'json') {
                            content = JSON.stringify(trialJson, null, 2);
                        } else {
                            content = YAML.safeDump(trialJson);
                        }
                        // create a folder and a file
                        zipFolder.file(nctId + '.' + this.fileType, content);
                    }
                }, this);
            }, this);
        }
    }

    uploadFiles() {
        let result = true;
        this.uploadFailedFileList = [];
        _.forEach(this.filesToUpload, function (file) {
            const fileReader = new FileReader();
            fileReader.readAsText(file);
            fileReader.onload = (e) => {
                let trialJson = {};
                if (file.name.includes('json')) {
                    trialJson = JSON.parse(fileReader.result);
                } else {
                    trialJson = YAML.safeLoad(fileReader.result);
                }
                const nctId = trialJson['nct_id'];
                trialJson['curation_status'] = 'In progress';
                trialJson['archived'] = 'No';
                // Check if this trial has been loaded. If yes, ask user if overwrite current trial.
                if (this.nctIdList.includes(nctId)) {
                    result = confirm('Trial ' + nctId + ' has been loaded in database. ' +
                        'Are you sure you want to overwrite this trial by loading file ' + file.name + '?');
                }
                if (result) {
                    this.trialService.saveTrialById(nctId, trialJson).then((res) => {
                        if (!res) {
                            this.uploadFailedFileList.push(file.name);
                        }
                        if (file.name === this.filesToUpload[this.filesToUpload.length - 1].name) {
                            if (_.isEmpty(this.uploadFailedFileList)) {
                                this.uploadMessage['content'] = 'Upload files successfully!';
                                this.uploadMessage['color'] = 'green';
                            } else {
                                this.uploadMessage['content'] = 'Sorry, files ' + this.uploadFailedFileList.join(', ') +
                                    ' are failed to upload. Please check file format or try it later!';
                                this.uploadMessage['color'] = 'red';
                            }
                        }
                    });
                }
            };
        }, this);
    }

    fileChanged($event) {
        const fileArray = [];
        this.uploadMessage['content'] = '';
        this.uploadFileNames = '';
        this.filesToUpload = $event.target.files;
        if (this.filesToUpload.length > 1) {
            _.forEach(this.filesToUpload, function (file) {
                fileArray.push(file.name);
            });
            this.uploadFileNames = fileArray.join(', ');
        }
    }

    getDownloadCheckbox(id: string, isChecked: boolean) {
        if (isChecked) {
            this.downloadIdList.push(id);
        } else {
            const index = this.downloadIdList.indexOf(id);
            this.downloadIdList.splice(index, 1);
        }
    }

    removeAttributes(data: object) {
        // Remove attributes not in CTML.
        const removedFields = ['archived', 'curation_status'];
        _.forEach(removedFields, function (item) {
            delete data[item];
        });
        if (data['treatment_list']['step'][0]['arm'].length > 0) {
            const removedArmFields = ['arm_info', 'arm_eligibility'];
            _.forEach(data['treatment_list']['step'][0]['arm'], function (arm) {
                _.forEach(removedArmFields, function (item) {
                    delete arm[item];
                });
            });
        }
    }

    formatForMatchMiner(trial: object) {
        _.forEach(trial['site_list']['site'], function (site){
            site['site_status'] = site['recruitment_status'];
            site['site_name'] = site['org_family'];
            site['coordinating_center'] = site['org_name'];
        });
        trial['curate_source'] = 'curation_tool'
    }
}
